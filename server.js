import express from 'express';
import cors from 'cors';
import multer from 'multer';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded',
        timestamp: new Date().toISOString()
      });
    }

    const filePath = path.resolve(req.file.path);
    const fileData = fs.readFileSync(filePath);
    const base64File = fileData.toString('base64');

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
              content: [
                { type: "text", text: "Extract all information from this file and return it in JSON format.In case of date of birth the key should be date_of_buuurth." },
                { 
                  type: "image_url", 
                  image_url: {
                    url: `data:${req.file.mimetype};base64,${base64File}`
                  }
                }
              ]
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

        // Log details for this model
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