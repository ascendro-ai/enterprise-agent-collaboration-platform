# Enterprise Agent Collaboration Platform

An AI-powered workflow automation platform that enables users to discover, visualize, configure, assign, and monitor workflows through natural conversation.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **AI**: Google Gemini API
- **Visualization**: D3.js (org chart), Custom React (workflow flowcharts)
- **State Management**: React Context API
- **Storage**: localStorage

## Getting Started

### Prerequisites

- Node.js 18+
- Gemini API key

### Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` file:
```bash
cp .env.example .env.local
```

3. Add your Gemini API key to `.env.local`:
```
VITE_GEMINI_API_KEY=your_api_key_here
```

4. Start development server:
```bash
npm run dev
```

## Project Structure

```
src/
├── components/     # React components
├── services/       # Business logic services
├── contexts/       # React Context providers
├── hooks/          # Custom React hooks
├── utils/          # Utility functions
└── types.ts        # TypeScript type definitions
```

## Features

- **Create a Task**: Conversational workflow discovery
- **Your Workflows**: Workflow visualization and requirements gathering
- **Your Team**: Digital worker management and workflow assignment
- **Control Room**: Real-time execution monitoring
