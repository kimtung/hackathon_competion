You are a senior software architect.

I have a multi-service project with the following structure:
- exchange/engine (Python, async, uv runtime)
- exchange/admin (React + Vite)
- client (React + Vite)

Your task is to analyze the entire codebase and produce a high-level system overview.

Focus on:

1. System Architecture
- Identify all services and their responsibilities
- Describe how services communicate with each other
- Identify key modules inside each service

2. Data Flow
- Describe the full flow of a user placing an order
- From client → backend → matching → response
- Include important intermediate steps

3. Matching Engine Internals
- How the order book is structured
- How matching works
- How state is updated

4. API Layer
- Main endpoints exposed by the backend
- How client and admin interact with engine

5. Concurrency Model
- How async is used
- Where race conditions might occur

6. State Management
- Where data is stored (in-memory, DB, cache)
- How consistency is maintained

Output format:

- High-level architecture summary
- Service-by-service breakdown
- Step-by-step flow (numbered)
- Optional: ASCII diagram for system flow

Important:
- Do not just list files
- Infer system behavior from code
- Highlight assumptions if something is unclear


Before answering:
- First build a mental model of the system
- Then explain it in a structured way
- Focus on how components interact, not just what they are


Also include:
- A simple ASCII diagram showing:
  client → engine → admin interactions
  and internal flow inside the engine
  
  
  Additionally:
- Identify potential weak points in the architecture
- Where bugs are likely to exist
- Where race conditions or inconsistencies may happen