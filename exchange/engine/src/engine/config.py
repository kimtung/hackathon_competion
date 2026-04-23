"""Stock configuration and market state management."""

from __future__ import annotations

from dataclasses import dataclass

from engine.models import MarketState

# BUG-QA-06 fix: cap max quantity để đảm bảo giá trị vẫn < 2^53 khi serialize qua JSON tới JS.
# 1e9 cổ phiếu là ngưỡng rộng rãi cho mọi case thực tế.
MAX_QUANTITY: int = 1_000_000_000


@dataclass
class StockConfig:
    symbol: str
    floor: int
    ceiling: int
    price_step: int
    qty_step: int

    def validate_price(self, price: int) -> str | None:
        """Return error message if price is invalid, None if valid."""
        if price < self.floor:
            return f"Price {price} below floor {self.floor}"
        if price > self.ceiling:
            return f"Price {price} above ceiling {self.ceiling}"
        if (price - self.floor) % self.price_step != 0:
            return f"Price {price} not aligned to step {self.price_step} (from floor {self.floor})"
        return None

    def validate_quantity(self, quantity: int) -> str | None:
        """Return error message if quantity is invalid, None if valid."""
        if quantity <= 0:
            return f"Quantity must be positive, got {quantity}"
        # BUG-QA-06 fix: chặn qty cực lớn để tránh mất chính xác trên JS UI
        # (Number precision cap ~2^53). 1e9 là ngưỡng thực tế rộng cho cổ phiếu.
        if quantity > MAX_QUANTITY:
            return f"Quantity {quantity} exceeds MAX_QUANTITY {MAX_QUANTITY}"
        if quantity % self.qty_step != 0:
            return f"Quantity {quantity} not aligned to step {self.qty_step}"
        return None


DEFAULT_STOCKS: dict[str, StockConfig] = {
    "ACB": StockConfig(symbol="ACB", floor=20000, ceiling=30000, price_step=100, qty_step=100),
    "FPT": StockConfig(symbol="FPT", floor=50000, ceiling=75000, price_step=500, qty_step=100),
    "VCK": StockConfig(symbol="VCK", floor=10000, ceiling=15000, price_step=100, qty_step=100),
}


class ExchangeConfig:
    def __init__(self) -> None:
        self.market_state: MarketState = MarketState.CLOSED
        self.stocks: dict[str, StockConfig] = {
            k: StockConfig(
                symbol=v.symbol,
                floor=v.floor,
                ceiling=v.ceiling,
                price_step=v.price_step,
                qty_step=v.qty_step,
            )
            for k, v in DEFAULT_STOCKS.items()
        }

    def is_open(self) -> bool:
        return self.market_state == MarketState.OPEN

    def open_market(self) -> None:
        self.market_state = MarketState.OPEN

    def close_market(self) -> None:
        self.market_state = MarketState.CLOSED

    def get_stock(self, symbol: str) -> StockConfig | None:
        return self.stocks.get(symbol)
