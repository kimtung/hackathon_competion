"""Matching engine managing per-stock order books."""

from __future__ import annotations

import os
import sys
import time  # BUG-05 fix: dùng timestamp để sinh exec_id unique cho các reject path
import itertools  # BUG-05 fix: counter unique cho reject exec_id

from engine.config import ExchangeConfig, StockConfig
from engine.models import (
    ExecType,
    ExecutionReport,
    OrdStatus,
    Order,
    Side,
    Trade,
)
from engine.order_book import MatchResult, OrderBook


class MatchingEngine:
    """Central matching engine that routes orders to per-stock order books."""

    def __init__(self, config: ExchangeConfig | None = None) -> None:
        self.config = config or ExchangeConfig()
        self._books: dict[str, OrderBook] = {}
        self._trades: list[Trade] = []
        # BUG-05 fix: counter cho reject exec_id để tránh trùng.
        self._reject_counter = itertools.count(1)

        # Initialize order books for all configured stocks
        for symbol, stock_config in self.config.stocks.items():
            self._books[symbol] = OrderBook(stock_config)

    def _next_reject_exec_id(self, tag: str) -> str:
        # BUG-05 fix: reject exec_id unique (trước đây là chuỗi hằng
        # "EXEC-REJ-MARKET-CLOSED" / "EXEC-REJ-UNKNOWN-SYM").
        return f"EXEC-REJ-{tag}-{next(self._reject_counter)}"

    def submit_order(self, order: Order) -> MatchResult:
        """Submit an order to the engine. Returns match result with trades and exec reports."""
        result = MatchResult()

        # Check market is open
        if not self.config.is_open():
            order.reject()
            result.exec_reports.append(ExecutionReport(
                cl_ord_id=order.cl_ord_id,
                order_id="",
                exec_id=self._next_reject_exec_id("MARKET-CLOSED"),  # BUG-05 fix
                exec_type=ExecType.REJECTED,
                ord_status=OrdStatus.REJECTED,
                symbol=order.symbol,
                side=order.side,
                price=order.price,
                quantity=order.quantity,
                leaves_qty=0,
                cum_qty=0,
                avg_px=0.0,
                reject_reason="Market is closed",
            ))
            return result

        # Check symbol exists
        book = self._books.get(order.symbol)
        if book is None:
            order.reject()
            result.exec_reports.append(ExecutionReport(
                cl_ord_id=order.cl_ord_id,
                order_id="",
                exec_id=self._next_reject_exec_id("UNKNOWN-SYM"),  # BUG-05 fix
                exec_type=ExecType.REJECTED,
                ord_status=OrdStatus.REJECTED,
                symbol=order.symbol,
                side=order.side,
                price=order.price,
                quantity=order.quantity,
                leaves_qty=0,
                cum_qty=0,
                avg_px=0.0,
                reject_reason=f"Unknown symbol: {order.symbol}",
            ))
            return result

        # BUG-03 fix: KHÔNG dùng os._exit(1) vì input đến từ client — một lệnh xấu
        # (price âm, qty ≤ 0, hoặc config degenerate) sẽ làm chết cả process sàn, gây DoS.
        # Thay vào đó reject order và trả exec report REJECTED cho client.
        envelope_err: str | None = None
        if order.price < 0:
            envelope_err = f"Negative price: {order.price}"
        elif order.quantity <= 0:
            envelope_err = f"Non-positive quantity: {order.quantity}"
        elif book.config.ceiling <= book.config.floor:
            envelope_err = (
                f"Degenerate price range for {order.symbol} "
                f"(floor={book.config.floor}, ceiling={book.config.ceiling})"
            )

        if envelope_err is not None:
            sys.stderr.write(f"[engine] reject envelope: {envelope_err}\n")
            sys.stderr.flush()
            order.reject()
            # BUG-05 fix: exec_id duy nhất theo thời gian thay vì chuỗi hằng.
            result.exec_reports.append(ExecutionReport(
                cl_ord_id=order.cl_ord_id,
                order_id="",
                exec_id=f"EXEC-REJ-ENV-{int(time.time() * 1_000_000)}",
                exec_type=ExecType.REJECTED,
                ord_status=OrdStatus.REJECTED,
                symbol=order.symbol,
                side=order.side,
                price=order.price,
                quantity=order.quantity,
                leaves_qty=0,
                cum_qty=0,
                avg_px=0.0,
                reject_reason=envelope_err,
            ))
            return result

        # Route to the stock's order book
        result = book.process_order(order)

        # Record trades
        self._trades.extend(result.trades)

        return result

    def get_order_book(self, symbol: str) -> OrderBook | None:
        return self._books.get(symbol)

    def get_trades(self, symbol: str | None = None) -> list[Trade]:
        if symbol is None:
            return list(self._trades)
        return [t for t in self._trades if t.symbol == symbol]

    def get_all_books(self) -> dict[str, OrderBook]:
        return dict(self._books)

    def update_stock_config(self, symbol: str, **kwargs: int) -> StockConfig | None:
        """Update stock config fields (floor, ceiling, price_step, qty_step).

        Returns the updated config, or None if symbol not found.
        Note: updating config does not affect existing orders on the book.
        """
        stock = self.config.get_stock(symbol)
        if stock is None:
            return None

        for key in ("floor", "ceiling", "price_step", "qty_step"):
            if key in kwargs:
                setattr(stock, key, kwargs[key])

        # Update the book's config reference too
        if symbol in self._books:
            self._books[symbol].config = stock

        return stock
