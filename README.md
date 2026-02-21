# ♟️ JekyllChess

> A lightweight Jekyll starter template for chess blogging.

[![Jekyll](https://img.shields.io/badge/Jekyll-4.x-red.svg)](https://jekyllrb.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://jekyllchess.github.io/)
[![Built with chess.js](https://img.shields.io/badge/chess.js-powered-blue)](https://github.com/jhlywa/chess.js)
[![Board Rendering: chessboard.js](https://img.shields.io/badge/chessboard.js-rendering-lightgrey)](https://github.com/oakmac/chessboardjs)

JekyllChess is a minimal-CSS Jekyll template designed specifically for chess bloggers and educators.  
It provides chess-aware components for diagrams, annotated games, interactive PGN viewers, and training boards — all inside a static Jekyll site.

---

## ✨ Features

### ♟ Figurine Notation
Automatically replaces SAN piece letters (K, Q, R, B, N) with Unicode figurines (♔♕♖♗♘) in visible page text.

---

### 📊 FEN Diagrams
Use custom `<fen>` tags directly in Markdown or HTML to render visual chessboards.

Supports:
- Inline diagrams
- Diagrams inside PGN comments
- Homepage preview diagrams via frontmatter

---

### 📖 Static PGN Renderer
Convert raw PGN inside `<pgn>` elements into a formatted chess blog layout.

Supports:
- Move numbers
- Variations
- Comments
- Numeric Annotation Glyphs (NAGs)
- Unicode advantage symbols (⩲, ⯹, etc.)

---

### 🎮 Interactive PGN Viewer
The `<pgn-reader>` component creates an interactive chess viewer with:

- Clickable move list
- Smooth board animations
- Variation support
- Responsive layout
- Desktop & mobile friendly UI

---

### 🧩 Puzzle Mode
Interactive puzzles powered by FEN or multi-puzzle PGN packs.

- Drag-and-drop moves
- Correct-move validation
- Automatic progression

---

### 🏋️ Training Mode
A guided PGN training board where moves are revealed as the reader finds correct continuations.

---

### 📝 Worksheet Mode
Simple mate-in-one and tactical worksheets using FEN positions.

---

## 🧠 Technology Stack

- **Jekyll** — Static site generator  
- **chess.js** — Chess rules & move validation  
- **chessboard.js** — Board rendering  
- Vanilla JavaScript components  
- Minimal CSS styling  

No backend required.  
Fully static.  
GitHub Pages compatible.

---

## 🚀 Quick Start

### 1️⃣ Clone the repository

```bash
git clone https://github.com/yourusername/jekyllchess.git
cd jekyllchess
```

### 2️⃣ Install dependencies

```bash
bundle install
```

### 3️⃣ Run locally

```bash
bundle exec jekyll serve
```

Visit:

```
http://localhost:4000
```

---

## 📦 Example Usage

### FEN Diagram

```html
<fen>
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
</fen>
```

---

### Static PGN Post

```html
<pgn>
1. e4 e5 2. Nf3 Nc6 3. Bb5 a6
</pgn>
```

---

### Interactive Viewer

```html
<pgn-reader>
[Event "Example"]
1. d4 d5 2. c4 e6 3. Nc3 Nf6
</pgn-reader>
```

---

## 🎯 Use Cases

- Chess blogs  
- Annotated game collections  
- Chess training websites  
- Tactics worksheets  
- Chess education platforms  
- Personal chess study journals  

---

## 🌍 Live Demo

👉 https://jekyllchess.github.io/

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

## ❤️ Contributing

Pull requests and ideas are welcome.

If you build something cool with JekyllChess, feel free to share it!

---

## ♟ Why JekyllChess?

Most blog themes are not chess-aware.

JekyllChess gives you:
- Native chess diagram support
- PGN rendering inside Markdown
- Interactive boards
- Clean static deployment

All without a backend or heavy frameworks.

---

Built for chess writers.  
Powered by open source.