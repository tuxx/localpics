# Makefile for localpics

BINARY_NAME=localpics
VERSION ?= dev
COMMIT  ?= $(shell git rev-parse --short HEAD)
DATE    ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS=-ldflags "-X 'main.Version=$(VERSION)' -X 'main.Commit=$(COMMIT)' -X 'main.BuildDate=$(DATE)'"

BUILD_DIR=build
GO=go

.PHONY: all
all: clean build

.PHONY: clean
clean:
	rm -rf $(BUILD_DIR)
	mkdir -p $(BUILD_DIR)

.PHONY: build
build:
	# Use consistent LDFLAGS for all builds
	$(GO) build -o $(BUILD_DIR)/$(BINARY_NAME) $(LDFLAGS)

# Release platforms only
.PHONY: release
release: clean linux-amd64 linux-arm64 windows-amd64 darwin-amd64 darwin-arm64

.PHONY: linux-amd64
linux-amd64:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GO) build -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 $(LDFLAGS) .

.PHONY: linux-arm64
linux-arm64:
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 $(GO) build -o $(BUILD_DIR)/$(BINARY_NAME)-linux-arm64 $(LDFLAGS) .

.PHONY: windows-amd64
windows-amd64:
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 $(GO) build -o $(BUILD_DIR)/$(BINARY_NAME)-windows-amd64.exe $(LDFLAGS) .

.PHONY: darwin-amd64
darwin-amd64:
	CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 $(GO) build -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-amd64 $(LDFLAGS) .

.PHONY: darwin-arm64
darwin-arm64:
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 $(GO) build -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-arm64 $(LDFLAGS) .

.PHONY: release-all
release-all: release

.PHONY: package
package:
	mkdir -p $(BUILD_DIR)/release
	cd $(BUILD_DIR) && \
	for file in $(BINARY_NAME)-* ; do \
		if [ -f $$file ]; then \
			case $$file in \
				*.exe) \
					cp $$file localpics.exe && \
					zip -j release/$$file.zip localpics.exe && \
					rm -f localpics.exe ;; \
				*) \
					cp $$file localpics && \
					tar -czf release/$$file.tar.gz localpics && \
					rm -f localpics ;; \
			esac \
		fi \
	done
