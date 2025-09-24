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

---

## 🚀 Running FastAPI as a Background Service on Ubuntu

Follow these steps to run your FastAPI app as a **systemd service** so it keeps running even after you close the terminal and automatically starts on server reboot.

---

### 1️⃣ Create a systemd Service File

```bash
sudo nano /etc/systemd/system/pdf-parse-app.service
```

Paste the following:

```ini
[Unit]
Description=PDF Parse FastAPI Microservice
After=network.target

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/ken-web-scrapper/pdf-text-ms
Environment="PATH=/home/ubuntu/ken-web-scrapper/pdf-text-ms/venv/bin"
ExecStart=/home/ubuntu/ken-web-scrapper/pdf-text-ms/venv/bin/uvicorn pdf_parse:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

> **Note:** Update paths if your project folder or virtual environment is in a different location.

---

### 2️⃣ Reload systemd and Start the Service

```bash
sudo systemctl daemon-reload
sudo systemctl start pdf-parse-app
sudo systemctl enable pdf-parse-app    # Auto-start on reboot
```

---

### 3️⃣ Check Service Status & Logs

```bash
# Check if service is running
sudo systemctl status pdf-parse-app

# View real-time logs
journalctl -u pdf-parse-app -f
```

---

### 4️⃣ Manage the Service

```bash
# Restart service
sudo systemctl restart pdf-parse-app

# Stop service
sudo systemctl stop pdf-parse-app
```

---

### ✅ Your FastAPI service is now running in the background!

Access it at:

```
http://<server-ip>:8000
```
