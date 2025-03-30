# 📸 LocalPics

[![Latest Release](https://img.shields.io/github/v/release/tuxx/localpics)](https://github.com/tuxx/localpics/releases)
[![Build](https://github.com/tuxx/localpics/actions/workflows/build.yml/badge.svg)](https://github.com/tuxx/localpics/actions/workflows/build.yml)

> A lightweight, no-nonsense media viewer for local directories

<p align="center">
    <img src="https://github.com/user-attachments/assets/8436178a-f51b-4c88-9d62-0ff6cff3b27c" alt="Slideshow of Webinterface">
</p>

## 🔍 Overview

I was fed up with overly complex gallery applications that process, copy, and transcode files unnecessarily. **LocalPics** is born out of the need for a simple, efficient way to view files in directories without any processing overhead. 

Just point it at a directory, and it instantly creates a beautiful, browser-based interface to explore your files - no database, no complicated setup, no file manipulation.

## ✨ Features

- 🚀 **Zero processing by default** - files are served directly from the source directory
- 📱 **Responsive layout** with lazy loading for browsing large directories
- 🖼️ **Media-specific viewers** for images, videos, audio, PDFs, and code files
- 📊 **File categorization** by type (images, videos, audio, text, code, etc.)
- 📷 **EXIF data extraction** for images with GPS location mapping
- 🔄 **Dynamic navigation** with keyboard shortcuts
- 📝 **Code syntax highlighting** for various programming languages
- 📦 **Single binary** with embedded template - no dependencies to install (unless you want video thumbnails)
- 🎞️ **Video thumbnails** with intelligent caching for faster browsing (requires ffmpeg, and does a bit of server-side processing)

## 🚀 Installation

### Recommended: Download a Release

Visit the [Releases page](https://github.com/tuxx/localpics/releases) and download the appropriate binary for your platform.

### Optional Dependencies

- FFmpeg (optional, required only for video thumbnail generation)

## 🖥️ Usage

```bash
# Basic usage (temporary output directory will be created)
./localpics -indir /path/to/your/media

# Specify an output directory
./localpics -indir /path/to/your/media -outdir /path/to/output

# Enable file deletion (use with caution)
./localpics -indir /path/to/your/media -delete

# Serve on a specific IP address and port
./localpics -indir /path/to/your/media -host 0.0.0.0:8080

# Enable video thumbnail generation (requires FFmpeg)
./localpics -indir /path/to/your/media -thumbnails

# Customize thumbnail caching
./localpics -indir /path/to/your/media -thumbnails -thumb-cache /path/to/cache -thumb-pregenerate 100
```

After starting, open the displayed URL in your browser to view your files.

## 📋 Command Line Options

| Option | Description |
|--------|-------------|
| `-indir` | **Required**. Directory to scan for media files |
| `-outdir` | Optional. Directory to write HTML and JSON files |
| `-delete` | Enable file deletion API (default: false) |
| `-host` | Host address to serve on (default: localhost:8080) |
| `-recursive` | Scan directory recursively (default: true) |
| `-thumbnails` | Enable video thumbnail generation (requires FFmpeg) |
| `-thumb-cache` | Directory to store video thumbnails (default: "thumbnails") |
| `-thumb-pregenerate` | Number of video thumbnails to pre-generate at startup (default: 50) |
| `-log` | Enable debug logging (default: false) |
| `-v` | Print version information and exit |
## 🏗️ Building from Source

### Prerequisites

- Go 1.16 or newer
- Make (for using the Makefile)
- FFmpeg (for video thumbnail support)

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
- **Video/Audio** - Native HTML5 players with thumbnail previews for videos
- **Video Thumbnails** - Automatically generated previews for videos with intelligent caching

## 🎞️ Video Thumbnail System

LocalPics can now generate thumbnails for videos to provide a better browsing experience:

- Automatically extracts a frame from each video to use as a thumbnail
- Intelligently caches thumbnails to avoid regeneration
- Shares thumbnails between similar videos (e.g., episodes of the same series)
- Pre-generates thumbnails at startup (configurable number)
- Enhanced UI with smooth loading animations

This feature requires FFmpeg to be installed on your system.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues to improve the application.

### Prerequisites

- Go 1.16 or newer
- Make (for using the Makefile)
- Git hooks installed
    - `./.githooks/setup-hooks.sh`
    - [prettier](https://prettier.io/docs/install) (for fixing the html template indenting)

### Before contributing
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

### 🪟 Windows Compatibility
- 🚦 Improved signal handling for graceful application shutdown on Windows
- 🧹 Better temporary file cleanup mechanisms for Windows environments
- 🔐 Cross-platform file permission handling that respects Windows ACLs
- 🛣️ Robust path handling to prevent issues with Windows file separators
- 🎞️ Platform-specific FFmpeg output capture for thumbnail generation

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
- Uses [FFmpeg](https://ffmpeg.org/) (via [ffmpeg-go](https://github.com/u2takey/ffmpeg-go)) for video thumbnail generation
