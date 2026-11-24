# Memory — Mind Map Maker

A responsive, browser-based workspace for creating and organizing your own mind maps. It starts blank: there is no fixed subject or pre-filled lesson.

## Features
- Create and manage multiple mind maps
- Add topics and child branches; rename and delete nodes
- Drag nodes, pan the canvas, zoom, and collapse or expand branches
- Autosave in the current browser with local storage
- Export and import maps as JSON
- Import an indented plain-text outline
- Import selectable text from PDF files (PDF.js CDN)
- Quick-start templates for study plans, projects, brainstorming, and weekly goals
- Built-in local topic helper with prompts and branch suggestions
- Responsive dark interface for desktop and mobile

## Run locally
Open `index.html` in a browser, or open this folder in VS Code and use the Live Server extension.

## Publish with GitHub Pages
1. Open this repository's **Settings**.
2. Open **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch **main** and folder **/ (root)**, then Save.
5. Wait for GitHub Pages to finish publishing.

The expected site address is https://kinjal-devs.github.io/memory/

## Data and privacy
Your maps are saved in this browser on this device. Export JSON to make a backup or transfer a map to another device. The local topic helper does not send data to an AI service. A true AI generator needs a secure backend and an AI provider; do not place private API keys in front-end JavaScript.

PDF import works for PDFs containing selectable text. Scanned PDFs require OCR, which is not included.
