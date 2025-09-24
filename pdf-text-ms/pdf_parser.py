import os
import tempfile
import pdfplumber
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI()

# Allow CORS if Nest.js is on another port
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3011","https://rightpage.io"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def extract_clean_text(pdf_path):
    final_text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            text_on_page = page.extract_text() or ""

            # Skip References page if it's the last one
            # if i == len(pdf.pages) - 1 and "references" in text_on_page.lower():
            #     continue

            words = page.extract_words(x_tolerance=1, y_tolerance=3)
            line_text = ""
            last_y = None

            for word in words:
                y0 = round(word["top"], 1)
                text = word["text"]

                if last_y is not None and abs(y0 - last_y) > 5:
                    final_text += line_text.strip() + "\n"
                    line_text = ""

                line_text += text + " "
                last_y = y0

            final_text += line_text.strip() + "\n\n"
    return final_text


@app.post("/extract-text")
async def extract_text(file: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        text = extract_clean_text(tmp_path)
        return {"text": text}
    finally:
        os.remove(tmp_path)


@app.get("/health")
def health_check():
    return {"status": "ok"}


# 🚀 If run directly: start FastAPI server
if __name__ == "__main__":
    uvicorn.run("pdf_parser:app", host="0.0.0.0", port=8000, reload=True)
