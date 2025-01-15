import express from 'express';
import cors from 'cors';
import multer from 'multer';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: 'uploads/' });
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
const logFilePath = path.join(__dirname, 'model_logs.txt');

app.use(express.static(path.join(__dirname, 'dist')));
app.use(cors({
  origin: `http://localhost:${process.env.CLIENT_PORT}`,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

const models = ["gpt-4-turbo", "gpt-4o-mini", "gpt-4o"];

async function pdfToPngBase64(pdfPath) {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Load the PDF file in a new page using a file URL
  const fileUrl = `file://${pdfPath}`;
  await page.goto(fileUrl, { waitUntil: 'networkidle2' });

  // Set viewport size if needed; adjust based on expected PDF dimensions
  await page.setViewport({ width: 1200, height: 1600 });

  // Capture screenshot of the visible area (first page)
  const screenshotBuffer = await page.screenshot({ fullPage: true });

  await browser.close();
  return screenshotBuffer.toString('base64');
}

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
        timestamp: new Date().toISOString()
      });
    }

    let base64File;
    const filePath = path.resolve(req.file.path);

    // Check if the uploaded file is a PDF
    if (req.file.mimetype === 'application/pdf') {
      try {
        base64File = await pdfToPngBase64(filePath);
      } catch (conversionError) {
        console.error('PDF to image conversion error:', conversionError);
        return res.status(500).json({
          success: false,
          error: 'Failed to convert PDF to image.',
          timestamp: new Date().toISOString()
        });
      }
    } else {
      // If not a PDF, read the file directly
      const fileData = fs.readFileSync(filePath);
      base64File = fileData.toString('base64');
    }

    const aggregatedResults = {};

    for (const model of models) {
      const startTime = Date.now();
      let response, parsedResponse, usage;
      try {
        response = await openai.chat.completions.create({
          model: model,
          messages: [
            {
              role: "user",
              content:
                "Extract all information from this image and retur{n it in JSON format. " +
                "In case of date of birth the key should be date_of_buuurth. " +
                `Refer this pdf url : https://pdfobject.com/pdf/sample.pdf`
            }
          ],
          max_tokens: 1000,
          response_format: { type: "json_object" }
        });

        usage = response.usage || {};
        const elapsedTime = Date.now() - startTime;

        try {
          parsedResponse = JSON.parse(response.choices[0].message.content);
          if (typeof parsedResponse !== 'object') {
            throw new Error('Invalid response format');
          }
        } catch (parseError) {
          console.error('Failed to parse LLM response:', parseError);
          parsedResponse = {
            error: 'Failed to parse LLM response',
            originalResponse: response.choices[0].message.content
          };
        }
        const logEntry = {
          timestamp: new Date().toISOString(),
          model,
          responseTimeMs: elapsedTime,
          tokens: {
            promptTokens: usage.prompt_tokens || 0,
            completionTokens: usage.completion_tokens || 0,
            totalTokens: usage.total_tokens || 0
          },
          response: parsedResponse
        };
        fs.appendFileSync(logFilePath, JSON.stringify(logEntry) + '\n', 'utf8');

        aggregatedResults[model] = logEntry;
      } catch (modelError) {
        console.error(`Error processing model ${model}:`, modelError);
        const errorLogEntry = {
          timestamp: new Date().toISOString(),
          model,
          error: modelError.message,
        };
        fs.appendFileSync(logFilePath, JSON.stringify(errorLogEntry) + '\n', 'utf8');

        aggregatedResults[model] = { error: modelError.message };
      }
    }

    fs.unlinkSync(filePath);

    res.json({
      success: true,
      data: aggregatedResults,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});
