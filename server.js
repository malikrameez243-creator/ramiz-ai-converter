require("dotenv").config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenAI } = require('@google/genai'); // Official Google SDK

const app = express();
const PORT = process.env.PORT || 3000;

// Nayi configuration aap ki nayi key ke sath
// Initialize Google Gen AI using environment variable
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
console.log("API Key:", process.env.GEMINI_API_KEY);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// LANGUAGE LIST (ISO 639-1)
const LANGUAGES = [
    { code: 'en', name: 'English', flag: 'us' },
    { code: 'es', name: 'Spanish', flag: 'es' },
    { code: 'fr', name: 'French', flag: 'fr' },
    { code: 'de', name: 'German', flag: 'de' },
    { code: 'it', name: 'Italian', flag: 'it' },
    { code: 'pt', name: 'Portuguese', flag: 'pt' },
    { code: 'ru', name: 'Russian', flag: 'ru' },
    { code: 'zh-cn', name: 'Chinese (Simplified)', flag: 'cn' },
    { code: 'ja', name: 'Japanese', flag: 'jp' },
    { code: 'ko', name: 'Korean', flag: 'kr' },
    { code: 'hi', name: 'Hindi', flag: 'in' },
    { code: 'ur', name: 'Urdu', flag: 'pk' },
    { code: 'ar', name: 'Arabic', flag: 'sa' },
    { code: 'bn', name: 'Bengali', flag: 'bd' },
    { code: 'tr', name: 'Turkish', flag: 'tr' },
    { code: 'ms', name: 'Malay', flag: 'my' },
    { code: 'uk', name: 'Ukrainian', flag: 'ua' },
    { code: 'ro', name: 'Romanian', flag: 'ro' },
    { code: 'hu', name: 'Hungarian', flag: 'hu' },
    { code: 'sw', name: 'Swahili', flag: 'tz' },
    { code: 'fil', name: 'Filipino', flag: 'ph' },
    { code: 'cs', name: 'Czech', flag: 'cz' },
    { code: 'el', name: 'Greek', flag: 'gr' },
    { code: 'th', name: 'Thai', flag: 'th' },
    { code: 'id', name: 'Indonesian', flag: 'id' },
    { code: 'mr', name: 'Marathi', flag: 'in' },
    { code: 'ta', name: 'Tamil', flag: 'in' },
    { code: 'te', name: 'Telugu', flag: 'in' },
    { code: 'pa', name: 'Punjabi', flag: 'in' }
];

// Fallback manual translator utilities
async function googleTranslate(text, from, to) {
    const params = new URLSearchParams({ client: 'gtx', sl: from, tl: to, dt: 't', q: text });
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?${params.toString()}`);
    const data = await res.json();
    if (data && data[0]) return data[0].map(sig => sig[0]).join('');
    throw new Error("Empty response");
}

async function myMemoryTranslate(text, from, to) {
    const params = new URLSearchParams({ q: text, langpair: `${from}|${to}` });
    const res = await fetch(`https://api.mymemory.translated.net/get?${params.toString()}`);
    const data = await res.json();
    if (data && data.responseData) return data.responseData.translatedText;
    throw new Error("No translation returned");
}

async function performTranslation(text, from, to) {
    try {
        return await googleTranslate(text, from, to);
    } catch (err) {
        return await myMemoryTranslate(text, from, to);
    }
}

// SDK Chatbot Engine (Handles your new key format perfectly)
async function geminiChat(userMessage, history = []) {
    const systemPrompt = `You are "Ramiz AI Assistant", a premium multilingual AI built into the RAMIZ AI CONVERTER platform. Act as a helpful IT expert and developer. Closely follow user's language choice (English, Urdu, or Roman Urdu).`;
    
    const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `${systemPrompt}\n\nUser request: ${userMessage}`
});

    if (response && response.text) {
        return response.text;
    }
    throw new Error("Invalid response from SDK");
}

async function smartFallbackChat(userMessage, history = []) {
    const msg = userMessage.toLowerCase();
    if (msg.includes('country') || msg.includes('countries')) {
        return "Here are 5 countries: 1. Pakistan, 2. United States, 3. United Kingdom, 4. Italy, 5. United Arab Emirates.";
    }
    if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
        return "Hello! I am your Ramiz AI Assistant. How can I help you today?";
    }
    return `I received your message: "${userMessage}". I am currently running on fallback mode, but I am here to help you!`;
}

async function performChat(userMessage, history = []) {
    try {
        return await geminiChat(userMessage, history);
    } catch (err) {
        console.warn("[Gemini SDK failed, running fallback]:", err.message);
        return await smartFallbackChat(userMessage, history);
    }
}

// Routes
app.get('/api/languages', (req, res) => res.json({ success: true, count: LANGUAGES.length, data: LANGUAGES }));
app.get('/api/health', (req, res) => res.json({ success: true, status: 'operational', uptime: process.uptime() }));

app.post('/api/translate', async (req, res) => {
    const { text, from, to } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ success: false, error: "Empty text" });
    try {
        const translated = await performTranslation(text.trim(), from, to);
        res.json({ success: true, data: { original: text, translated, from, to } });
    } catch (err) {
        res.status(500).json({ success: false, error: "Translation failed" });
    }
});

app.post('/api/assistant', async (req, res) => {
    const { message, history } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ success: false, error: "Empty message" });
    try {
        const reply = await performChat(message.trim(), history);
        res.json({ success: true, data: { reply, timestamp: new Date().toISOString() } });
    } catch (err) {
        res.status(500).json({ success: false, error: "Assistant error" });
    }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
    console.log(`\n⚡ RAMIZ AI CONVERTER running at http://localhost:${PORT}\n`);
});