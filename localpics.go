package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"html/template"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"syscall"
	"time"
)

//go:embed template/index.html
var templateFS embed.FS

//go:embed static/css static/js
var staticFS embed.FS

// Version information
var (
	Version   = "dev"
	Commit    = "unknown"
	BuildDate = "unknown"
)

// FileInfo holds information about each file
type FileInfo struct {
	Name      string    `json:"name"`
	Path      string    `json:"path"`
	Size      int64     `json:"size"`
	Modified  time.Time `json:"modified"`
	Extension string    `json:"extension"`
	Type      string    `json:"type"`
}

// TemplateData holds data to pass to the template
type TemplateData struct {
	AllowDelete       bool
	Version           string
	ThumbnailsEnabled bool
	DebugLogging      bool
}

// Debug loggin function
func debugLog(format string, v ...interface{}) {
	if debugLogging {
		log.Printf("[DEBUG] "+format, v...)
	}
}

// categorizeFileType determines the media type based on file extension
func categorizeFileType(ext string) string {
	ext = strings.ToLower(ext)
	switch ext {
	case "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "ico", "jfif":
		return "image"
	case "mp4", "webm", "mkv", "mpeg", "3gp":
		return "video"
	case "mp3", "wav", "ogg", "flac", "aac", "opus":
		return "audio"
	case "pdf":
		return "pdf"
	case "txt", "md", "log":
		return "text"
	case "go", "py", "c", "cpp", "h", "js", "ts", "html", "css", "sh", "java", "rs", "gd":
		return "code"
	case "zip", "rar", "7z", "gz", "tgz":
		return "archive"
	default:
		return "other"
	}
}

// scanDirectory scans a directory for files
func scanDirectory(root string, baseURL string, recursive bool) ([]FileInfo, error) {
	var files []FileInfo

	if recursive {
		// Use Walk for recursive scanning
		err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}

			// Skip directories themselves
			if info.IsDir() {
				return nil
			}

			// Get the relative path from the root directory
			relPath, err := filepath.Rel(root, path)
			if err != nil {
				return err
			}

			name := info.Name()
			if name == "index.html" || strings.HasSuffix(name, ".json") {
				return nil
			}

			ext := strings.TrimPrefix(filepath.Ext(name), ".")
			fileType := categorizeFileType(ext)

			// Always use forward slashes for web URLs, regardless of platform
			webPath := filepath.Join(baseURL, relPath)
			webPath = strings.ReplaceAll(webPath, "\\", "/")

			files = append(files, FileInfo{
				Name:      name,
				Path:      webPath,
				Size:      info.Size(),
				Modified:  info.ModTime(),
				Extension: ext,
				Type:      fileType,
			})

			return nil
		})

		if err != nil {
			return nil, err
		}
	} else {
		// Original non-recursive logic
		entries, err := os.ReadDir(root)
		if err != nil {
			return nil, err
		}

		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			name := entry.Name()
			if name == "index.html" || strings.HasSuffix(name, ".json") {
				continue
			}
			info, err := entry.Info()
			if err != nil {
				continue
			}
			ext := strings.TrimPrefix(filepath.Ext(name), ".")
			fileType := categorizeFileType(ext)

			// Always use forward slashes for web URLs, regardless of platform
			webPath := filepath.Join(baseURL, name)
			webPath = strings.ReplaceAll(webPath, "\\", "/")

			files = append(files, FileInfo{
				Name:      name,
				Path:      webPath,
				Size:      info.Size(),
				Modified:  info.ModTime(),
				Extension: ext,
				Type:      fileType,
			})
		}
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].Name < files[j].Name
	})

	return files, nil
}

func writeJSONFiles(files []FileInfo, outputDir string) error {
	typeMap := map[string][]FileInfo{}
	for _, f := range files {
		typeMap[f.Type] = append(typeMap[f.Type], f)
	}
	for typ, items := range typeMap {
		jsonPath := filepath.Join(outputDir, typ+".json")
		data, err := json.MarshalIndent(items, "", "  ")
		if err != nil {
			return err
		}
		err = os.WriteFile(jsonPath, data, 0644)
		if err != nil {
			return err
		}
	}
	return nil
}

// generateHTML creates the index.html file in the output directory
func generateHTML(outputDir string, allowDelete bool, thumbnailsEnabled bool, debugLogging bool) error {
	tmplContent, err := templateFS.ReadFile("template/index.html")
	if err != nil {
		return fmt.Errorf("failed to read embedded template: %w", err)
	}

	// Parse the template
	tmpl, err := template.New("index").Parse(string(tmplContent))
	if err != nil {
		return fmt.Errorf("failed to parse template: %w", err)
	}

	// Create the output file
	indexPath := filepath.Join(outputDir, "index.html")
	outFile, err := os.Create(indexPath)
	if err != nil {
		return fmt.Errorf("failed to create index.html: %w", err)
	}
	defer outFile.Close()

	// Execute the template with data
	data := TemplateData{
		AllowDelete:       allowDelete,
		Version:           Version,
		ThumbnailsEnabled: thumbnailsEnabled,
		DebugLogging:      debugLogging,
	}

	if err := tmpl.Execute(outFile, data); err != nil {
		return fmt.Errorf("failed to execute template: %w", err)
	}

	return nil
}

func cleanupOnExit(path string) {
	c := make(chan os.Signal, 1)

	// Handle cross-platform signals
	if runtime.GOOS == "windows" {
		// Windows only reliably supports os.Interrupt (Ctrl+C)
		signal.Notify(c, os.Interrupt)
	} else {
		// Unix-based systems support more signals
		signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	}

	go func() {
		<-c
		fmt.Println("\nCleaning up...")
		os.RemoveAll(path)
		os.Exit(0)
	}()
}

// FileDeleteHandler handles file deletion if enabled
func FileDeleteHandler(inputDir string, allowDelete bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !allowDelete {
			http.Error(w, "File deletion is not enabled", http.StatusForbidden)
			return
		}

		if r.Method != "DELETE" {
			http.Error(w, "Only DELETE method is allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract filename from path, normalize for Windows
		filename := r.URL.Path[len("/delete/"):]
		filename = strings.ReplaceAll(filename, "/", string(os.PathSeparator))

		if filename == "" {
			http.Error(w, "No filename specified", http.StatusBadRequest)
			return
		}

		// Prevent directory traversal
		cleanPath := filepath.Clean(filename)
		if strings.Contains(cleanPath, "..") {
			http.Error(w, "Invalid file path", http.StatusBadRequest)
			return
		}

		fullPath := filepath.Join(inputDir, cleanPath)

		// Check if file exists
		_, err := os.Stat(fullPath)
		if os.IsNotExist(err) {
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}

		// Delete the file
		err = os.Remove(fullPath)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to delete file: %v", err), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, "File %s deleted successfully", filename)
	}
}

func copyStaticFiles(outputDir string) error {
	// Walk through embedded static files and copy them to the output directory
	return fs.WalkDir(staticFS, "static", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		// Skip the root directory
		if path == "static" {
			return nil
		}

		// Create destination path
		dstPath := filepath.Join(outputDir, path)

		// Create directories
		if d.IsDir() {
			return os.MkdirAll(dstPath, fs.ModePerm)
		}

		// Copy files
		data, err := staticFS.ReadFile(path)
		if err != nil {
			return fmt.Errorf("failed to read embedded file %s: %w", path, err)
		}

		if err := os.WriteFile(dstPath, data, 0644); err != nil {
			return fmt.Errorf("failed to write file %s: %w", dstPath, err)
		}

		return nil
	})
}

func main() {
	inputDir := flag.String("indir", "", "Directory to scan for media files")
	outputDir := flag.String("outdir", "", "Directory to write HTML and JSON files (optional)")
	allowDelete := flag.Bool("delete", false, "Enable file deletion API (default: false)")
	showVersion := flag.Bool("v", false, "Print version information and exit")
	hostAddr := flag.String("host", "localhost:8080", "Host address to serve on (default: localhost:8080)")
	recursive := flag.Bool("recursive", true, "Scan directory recursively (default: true)")
	enableThumbnails := flag.Bool("thumbnails", false, "Enable video thumbnail generation (requires FFmpeg)")
	thumbnailCache := flag.String("thumb-cache", "thumbnails", "Directory to store video thumbnails")
	preGenerate := flag.Int("thumb-pregenerate", 50, "Number of video thumbnails to pre-generate at startup")
	debugLog := flag.Bool("log", false, "Enable debug logging (default: false)")

	flag.Usage = func() {
		fmt.Println("Usage: localpics -indir <input_directory> [-outdir <output_directory>] [-delete] [-host <host:port>]")
		flag.PrintDefaults()
	}

	flag.Parse()

	if *showVersion {
		fmt.Printf("LocalPics\nVersion: %s\nCommit: %s\nBuildDate: %s\n", Version, Commit, BuildDate)
		os.Exit(0)
	}

	// Initialize thumbnail system BEFORE generating any HTML
	thumbnailsEnabled := false
	if *enableThumbnails {
		InitThumbnails(true, *thumbnailCache, *preGenerate, *debugLog)
		thumbnailsEnabled = true // Explicit local variable
	}

	if *inputDir == "" {
		flag.Usage()
		os.Exit(1)
	}

	tempOut := false
	if *outputDir == "" {
		temp, err := os.MkdirTemp("", "localpics-*")
		if err != nil {
			log.Fatalf("failed to create temporary output directory: %v", err)
		}
		*outputDir = temp
		tempOut = true
	}

	if err := os.MkdirAll(*outputDir, fs.ModePerm); err != nil {
		log.Fatalf("failed to create output directory: %v", err)
	}
	staticDir := filepath.Join(*outputDir, "static")
	cssDir := filepath.Join(staticDir, "css")
	jsDir := filepath.Join(staticDir, "js")

	if err := os.MkdirAll(cssDir, fs.ModePerm); err != nil {
		log.Fatalf("failed to create CSS directory: %v", err)
	}
	if err := os.MkdirAll(jsDir, fs.ModePerm); err != nil {
		log.Fatalf("failed to create JS directory: %v", err)
	}

	files, err := scanDirectory(*inputDir, "/media", *recursive)
	if err != nil {
		log.Fatalf("failed to scan directory: %v", err)
	}

	if err := writeJSONFiles(files, *outputDir); err != nil {
		log.Fatalf("failed to write JSON files: %v", err)
	}

	if err := generateHTML(*outputDir, *allowDelete, thumbnailsEnabled, *debugLog); err != nil {
		log.Fatalf("failed to write HTML file: %v", err)
	}

	fmt.Println("Static directory index generated in:", *outputDir)
	if tempOut {
		cleanupOnExit(*outputDir)
	}

	if err := copyStaticFiles(*outputDir); err != nil {
		log.Fatalf("failed to copy static files: %v", err)
	}

	// Set up HTTP server
	if *allowDelete {
		fmt.Println("⚠️ WARNING: File deletion API is enabled")
		http.Handle("/delete/", FileDeleteHandler(*inputDir, true))
	}

	// Add thumbnail handler if enabled
	if thumbnailsEnabled {
		http.Handle("/thumbnail/", ThumbnailHandler(*inputDir))

		// Start pre-generating thumbnails for videos
		go PreGenerateThumbnails(files, *inputDir)
	}

	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir(filepath.Join(*outputDir, "static")))))
	http.Handle("/media/", http.StripPrefix("/media/", http.FileServer(http.Dir(*inputDir))))
	http.Handle("/", http.FileServer(http.Dir(*outputDir)))

	fmt.Printf("Serving on http://%s\n", *hostAddr)
	log.Fatal(http.ListenAndServe(*hostAddr, nil))
}
