call ..\.venv\Scripts\activate.bat

uvicorn app.main:app --host 0.0.0.0 --port 20559 --reload --reload-exclude "data/*