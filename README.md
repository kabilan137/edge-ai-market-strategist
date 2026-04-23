# Edge AI Market Strategist

## High-Level Overview
The **Edge AI Market Strategist** is an advanced, decentralized market intelligence platform. Engineered to identify and evaluate local retail and global product opportunities, it leverages real-time web scraping, spatial density analytics, and robust Edge AI inference to synthesize strategic intelligence. 

By operating a local **Llama 3** engine, the platform guarantees data privacy, zero API latency costs, and complete architectural autonomy. The pipeline ingests physical geography constraints via the **Overpass API**, sanitizes raw digital sentiment, and deterministically calculates data volume reliability, forcing the LLM to output highly restricted, actionable playbooks.

## Architecture & Data Flow
1. **Express Backend**: Acts as the central orchestrator and deterministic constraint manager.
2. **Puppeteer Scraper**: Dynamically bypasses static blocks to extract live competitor sentiment and product reviews.
3. **Node.js Sanitizer**: Cleanses raw HTML into concise text vectors, optimizing context windows and calculating deterministic "Confidence Scores."
4. **Local Llama 3 (Ollama)**: Evaluates the geographic variables (density, climate) against digital sentiment to output JSON-formatted business tactics.
5. **React Frontend**: Renders a dynamic "Theater of Compute" and visualizes the intelligence via real-time Recharts dashboards.

## Prerequisites
Before initializing the environment, ensure you have the following installed on your host machine:
- **Node.js** (v18.x or higher)
- **MongoDB** (Local instance or Atlas cluster)
- **Ollama** (Local Edge AI Engine)

## Collaborator Setup Instructions

1. **Clone the Repository:**
   ```bash
   git clone <https://github.com/kabilan137/edge-ai-market-strategist>
   cd "Business gap finder"
   ```

2. **Environment Configuration:**
   Copy the example environment file and inject your specific secrets:
   ```bash
   cp .env.example .env
   ```
   *Note: Open the `.env` file and define `PORT` and `MONGO_URI`.*

3. **Install Dependencies:**
   Install backend and frontend dependencies concurrently:
   ```bash
   npm install
   cd client && npm install
   ```

## Local AI Engine Provisioning

**The AI model is NOT stored in this repository.** This project relies on local edge compute to ensure data privacy and prevent third-party API rate limiting. 

Before starting the Express backend, you **MUST** provision the local Llama 3 engine. 

1. Install [Ollama](https://ollama.com/) on your host machine.
2. Open a dedicated terminal window and run:
   ```bash
   ollama run llama3
   ```
3. Keep this terminal open. It acts as your local inference server (defaulting to port `11434`). If this server is offline, the backend routing will fail with a 503 error.

## Running the Application
Once dependencies are installed and the Ollama server is humming in the background, you can launch the full stack.

Start the backend (from the root directory):
```bash
npm start
```

Start the React frontend (from the `client` directory):
```bash
npm run dev
```
