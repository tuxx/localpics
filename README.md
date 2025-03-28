# 📸 LocalPics

[![Latest Release](https://img.shields.io/github/v/release/tuxx/localpics)](https://github.com/tuxx/localpics/releases)
[![Build](https://github.com/tuxx/localpics/actions/workflows/build.yml/badge.svg)](https://github.com/tuxx/localpics/actions/workflows/build.yml)

> A lightweight, no-nonsense media viewer for local directories

## 🔍 Overview

I was fed up with overly complex gallery applications that process, copy, and transcode files unnecessarily. **LocalPics** is born out of the need for a simple, efficient way to view files in directories without any processing overhead. 

Just point it at a directory, and it instantly creates a beautiful, browser-based interface to explore your files - no database, no complicated setup, no file manipulation.

## ✨ Features

- 🚀 **Zero processing** - files are served directly from the source directory
- 📱 **Responsive layout** with lazy loading for browsing large directories
- 🖼️ **Media-specific viewers** for images, videos, audio, PDFs, and code files
- 📊 **File categorization** by type (images, videos, audio, text, code, etc.)
- 📷 **EXIF data extraction** for images with GPS location mapping
- 🔄 **Dynamic navigation** with keyboard shortcuts
- 📝 **Code syntax highlighting** for various programming languages
- 📦 **Single binary** with embedded template - no dependencies to install

## 🚀 Installation

### Recommended: Download a Release

Visit the [Releases page](https://github.com/tuxx/localpics/releases) and download the appropriate binary for your platform.

## 🖥️ Usage

```bash
# Basic usage (temporary output directory will be created)
./localpics -indir /path/to/your/media

# Specify an output directory
./localpics -indir /path/to/your/media -outdir /path/to/output

# Enable file deletion (use with caution)
./localpics -indir /path/to/your/media -delete
```

After starting, open `http://localhost:8080` in your browser to view your files.

## 📋 Command Line Options

| Option | Description |
|--------|-------------|
| `-indir` | **Required**. Directory to scan for media files |
| `-outdir` | Optional. Directory to write HTML and JSON files |
| `-delete` | Enable file deletion API (default: false) |

## 🏗️ Building from Source

### Prerequisites

- Go 1.16 or newer
- Make (for using the Makefile)

### Build Commands

```bash
# Clean and build for current platform
make all

# Build for specific architectures
make linux-amd64
make darwin-arm64
make windows-amd64

# Build for all supported platforms
make release-all

# Package builds into archives
make package
```

## 🌟 Interface

- **Home** - View file statistics and category breakdown
- **Categories** - Browse files by type (images, videos, audio, etc.)
- **Image Viewer** - View images with EXIF data, navigation, and download options
- **Code Viewer** - Syntax-highlighted code with full-screen viewing
- **Video/Audio** - Native HTML5 players for media files

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues to improve the application.

### Prerequisites

- Go 1.16 or newer
- Make (for using the Makefile)
- Git hooks installed
    - `./.githooks/setup-hooks.sh`
    - [prettier](https://prettier.io/docs/install) (for fixing the html template indenting)

Before contributing:
1. Fork the repo
2. Push your changes and submit a Pull Request
3. Bother [Tuxx](https://github.com/tuxx) if it sits too long 🙂

## 🔮 Future Improvements

- 🔍 Search functionality for finding files quickly
- 🗑 Delete files from the webinterface
- 🌓 Dark mode support
- 📱 Better mobile optimizations
- 🔄 Sorting options (by name, date, size)
- 📂 Archive content viewing
- 🎭 MIME type detection for better file categorization
- 🔒 Basic authentication option
- 🔄 WebSocket support for real-time directory updates
- 🎮 Slideshow mode for images

## 📜 License

This project is licensed under the [GNU General Public License v2.0 (GPL-2.0)](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html).

This is a copyleft license that requires anyone who distributes your code or derivative works to make the source available under the same terms. See the [LICENSE](LICENSE) file in the repository for the full text.

GPL-2.0 ensures that all modifications to the code remain free and open source.

## 🙏 Acknowledgments

- Built using pure Go with standard libraries
- Frontend uses vanilla JavaScript for maximum performance
- Uses [Prism](https://prismjs.com/) for syntax highlighting
- Uses [ExifJS](https://github.com/exif-js/exif-js) for EXIF extraction
- Uses [Marked](https://marked.js.org/) for markdown rendering
