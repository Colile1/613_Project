
# Python Coding Rules

## Core Principles

* Write **modular code**: each function and module must have a single, clear responsibility.
* Structure the project using **packages (folders with `__init__.py`)**.
* The **main application entry point** must contain minimal logic and only orchestrate execution.
* Prefer **simple, readable solutions** over complex ones.
* Use `n` to represent a number. For multiple values: `n1`, `n2`, `n3`, etc.
* Output must be **numeric-first**, with a short label:

  ```python
  print("Sum:", result)
  ```
* Use **South African naming defaults**:

  * Male name: `Colile`
  * Place name: `Johannesburg`
  * South African Currency 
  * 

---

## Project Structure Rules

* Each major component must live in its **own folder (Python package)**.
* Each folder must contain:

  * `__init__.py`
  * `README.md` (explains purpose and how it fits into the system)




### Example Structure

```
project_root/
│
├── app/
|   ├── README.md
│   └── main.py
│
├── logic/
|   ├── README.md
│   ├── __init__.py
│   └── calculations.py
│
├── input/
|   ├── README.md
│   ├── __init__.py
│   └── input_handlers.py
│
├── output/
|   ├── README.md
│   ├── __init__.py
│   └── output_handlers.py
│
├── README.md
├── todo.md
├── log.md
├── starter_guide.md
```

---

## File Rules

* Each file must:

  * Have a **single clear purpose**
  * Be **≤ 120 lines** (soft limit)
* If a file grows too large → **split by responsibility**

---

## Python Function Design Rules

Since Python does not enforce purity, enforce it **by convention**:

### Function Types

#### 1. Pure Functions

* No input/output (no `print()`, no `input()`)
* Deterministic: same input → same output

```python
# Pure function: calculates sum of two numbers.
def calculate_sum(n1, n2):
    return n1 + n2
```

---

#### 2. Input Wrappers

* Only responsible for collecting input
* Must call a pure function
* Must NOT print

```python
# Input wrapper: collects input and applies calculation.
def get_calculate_sum():
    n1 = int(input("Enter first number: "))
    n2 = int(input("Enter second number: "))
    return calculate_sum(n1, n2)
```

---

#### 3. Output Logic

* Handles printing/output formatting only

```python
# Output logic: prints the result.
def display_result(result):
    print("Sum:", result)
```

---

## Main Function Rule

* Every executable file must have:

```python
def main():
    result = get_calculate_sum()
    display_result(result)

if __name__ == "__main__":
    main()
```

* `main()` must:

  * Only coordinate function calls
  * Contain **minimal logic**

---

## Naming Conventions

* Use **snake_case** (Python standard)
* Pure functions → descriptive names:

  * `calculate_sum`
* Input wrappers → `get_` prefix:

  * `get_calculate_sum`
* Output functions → action-based:

  * `display_result`

---

## Commenting Rules (Python Version)

### File-Level Comments

```python
# calculations.py : basic math operations
# Contains pure functions for arithmetic calculations.
```

---

### Function-Level Comments

Each function must have a comment directly above it:

```python
# Pure function: calculates sum of two numbers.
def calculate_sum(n1, n2):
    return n1 + n2
```

```python
# Input wrapper: collects input and applies sum calculation.
def get_calculate_sum():
    ...
```

```python
# Output logic: displays the result.
def display_result(result):
    ...
```

---

## Separation of Concerns (Strict)

* Pure functions → NO I/O
* Input wrappers → input only
* Output functions → output only
* `main()` → orchestration only

---

## Documentation & Tracking Rules

### `todo.md`

* Tracks pending and completed tasks
* Must be updated continuously

Example:

```
- [x] Create project structure
- [ ] Implement calculation module
```

---

### `log.md`

Acts as a **development journal + teaching artifact**

Each entry must include:

* What was done
* Why it was done
* Impact on the system

Example:

```
[2026-04-30]
Created calculations.py
Reason: isolate business logic from input/output
Impact: improves modularity and testability
```

### `starter_guide.md`
Instructs programmers how to start the project and how to test it (both as a whole and in components)
---

## Key Python-Specific Adjustments (Important)

* No type signatures required (optional: use type hints if needed)
* Enforce purity through discipline, not compiler rules
* Use `if __name__ == "__main__":` instead of implicit execution
* Prefer **readability over strict functional style**

---

## Common Pitfalls (Python Context)

* Mixing `input()` and logic inside the same function ❌
* Printing inside pure functions ❌
* Overusing classes when functions are sufficient ❌
* Large “god files” instead of modular structure ❌
* Skipping `main()` and executing logic at import time ❌

