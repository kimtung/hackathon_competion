Trong workspace này là một stock exchange đơn giản gồm 3 service
- exchange/engine là engine khớp lệnh, tecj stack dùng python + uv
- exchange/admin phân hệ dành cho admin, tech stack dùng react + vite
- client phân hệ cho người dùng, tech stack dùng react + vite

hãy  reviewing  stock exchange project này với vai trò:
- senior backend engineer
- senior frontend engineer

Context:
- The system is a stock exchange with order matching

Your task:
- Review the stock exchange  logic and identify potential bugs

Focus on:
1. Matching correctness (overfill, underfill, FIFO violations)
2. State consistency (order status vs remaining quantity)
3. Concurrency issues (race conditions in async code)
4. Edge cases (partial fill, cancel during match, empty book)

Output:
- List of suspected bugs
- Tên của mỗi bug, mô tả chi tiết trước
- Khi nào sảy ra
- kịch bản tái hiện (step-by-step orders)
- Severity (low/medium/high/critical)

Important:
- Assume some bugs are intentionally injected
- Look for subtle issues, not obvious syntax errors

Hãy liệt kê ra file docs/bug_dev.md, docs/bug_dev.html

hãy fix các bug vừa tìm được (bug_dev.md), những thay đổi cần phải comment mã bug để biết tôi biết được đoạn thay đổi đó cho bug nào


You are a QA engineer testing a stock exchange system.

Your goal:
- Break the system and uncover hidden bugs

Focus on:
1. Edge cases:
   - very large orders
   - zero or negative values
   - rapid order placement
2. Sequence-based bugs:
   - place → partial fill → cancel → modify
3. Concurrency:
   - simulate multiple users placing/canceling orders simultaneously
4. Rare conditions:
   - price gaps
   - multiple orders triggering at same time

Tasks:
- Propose test cases that could expose bugs
- Identify expected vs actual incorrect behavior
- Suggest how to automate these tests

Output:
- Tên của mỗi bug, mô tả chi tiết trước
- Khi nào sảy ra
- kịch bản tái hiện (step-by-step orders)
- Severity (low/medium/high/critical)

Với mỗi bug tìm thấy hãy mô tả chi tiết, bao gồm các điều kiện gì kết hợp với nhau để sảy ra được và ghi vào docs/bug_qa.md, docs/bug_qa.html 
hãy fix các bug vừa tìm được (bug_qa.md), những thay đổi cần phải comment mã bug để biết tôi biết được đoạn thay đổi đó cho bug nào


3. You are a security engineer reviewing a stock exchange system with:

- client (React)
- admin (React)
- engine (Python backend)

Your goal:
- Identify security vulnerabilities

Focus on:
1. Authorization:
   - Can a user access or modify another user's orders?
2. IDOR (Insecure Direct Object Reference):
   - Accessing resources by ID without proper checks
3. Race conditions:
   - double spend, double match
4. Input validation:
   - price, quantity, order type
5. Privilege escalation:
   - calling admin APIs as a normal user

Tasks:
- List possible attack vectors
- Provide exploit scenarios (step-by-step)
- Explain impact (data leak, financial loss, etc.)

Important:
- Assume some vulnerabilities are subtle and require specific conditions


Output:
- Tên của mỗi bug, mô tả chi tiết trước
- Khi nào sảy ra
- kịch bản  (step-by-step orders)
- Severity, impact như thế nào (low/medium/high/critical)

Với mỗi bug tìm thấy hãy mô tả chi tiết, bao gồm các điều kiện gì kết hợp với nhau để sảy ra được và ghi vào docs/bug_sec.md, docs/bug_sec.html 


