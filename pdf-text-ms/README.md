# PDF Text Extractor Microservice

A lightweight Python microservice to **read PDF files and extract their text**. Built with FastAPI, it can be run locally or deployed as a service.

---

## Features

- Extract text from PDF files
- Simple HTTP API
- Health check endpoint to verify service status

---

## Requirements

- Python 3.7+
- Packages: FastAPI, Uvicorn, pdfplumber, python-multipart

---

## Installation

Install the required packages using `pip`:

```bash
pip3 install -r requirements.txt
```

### Package Description

| Package            | Purpose                                   |
| ------------------ | ----------------------------------------- |
| `fastapi`          | Framework to build the API/microservice   |
| `uvicorn`          | ASGI server to run FastAPI applications   |
| `pdfplumber`       | Extract text from PDF files               |
| `python-multipart` | Handle file uploads via FastAPI endpoints |

---

## Running the Service

### On macOS (standalone script)

```bash
python3 pdf_parser.py
```

or

```bash
python pdf_parser.py
```

### On Linux (using Uvicorn)

```bash
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

---

## API Endpoints

### Health Check

```http
GET /health
```

- Returns a simple JSON response to confirm the service is running:

```json
{
  "status": "healthy"
}
```

---

### Extract Text from PDF

```http
POST /extract-text
```

- Accepts a PDF file as `multipart/form-data`.
- Returns extracted text from the PDF.

**Example using `curl`:**

```bash
curl -X POST "http://localhost:8000/extract-text" -F "file=@sample.pdf"
```

**Response:**

```json
{
  "text": "Extracted text from PDF goes here..."
}
```
