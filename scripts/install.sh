#!/bin/bash
set -e

# Clix CLI Installer
# Usage: curl -fsSL https://cli.clix.so/install.sh | bash
#   or:  CLIX_VERSION=v1.0.0 curl -fsSL ... | bash
#
# Environment Variables:
#   CLIX_VERSION         - Version to install (default: latest)
#   CLIX_INSTALL_DIR     - Installation directory (default: ~/.local/bin)
#   CLIX_NO_MODIFY_PATH  - Skip automatic PATH modification (default: false)
#   CLIX_SKIP_CHECKSUM   - Skip SHA256 verification (default: false)

CLIX_VERSION="${CLIX_VERSION:-latest}"
CLIX_INSTALL_DIR="${CLIX_INSTALL_DIR:-$HOME/.local/bin}"
CLIX_NO_MODIFY_PATH="${CLIX_NO_MODIFY_PATH:-false}"
CLIX_SKIP_CHECKSUM="${CLIX_SKIP_CHECKSUM:-false}"
GITHUB_REPO="clix-so/clix-cli"

# Colors (only if terminal supports them)
if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  NC='\033[0m'
else
  RED=''
  GREEN=''
  YELLOW=''
  NC=''
fi

info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1"
  exit 1
}

# --- Downloader functions ---

DOWNLOADER=""

detect_downloader() {
  if command -v curl >/dev/null 2>&1; then
    DOWNLOADER="curl"
  elif command -v wget >/dev/null 2>&1; then
    DOWNLOADER="wget"
  else
    error "Neither curl nor wget found. Please install one of them."
  fi
}

download_to_stdout() {
  local url="$1"
  if [ "$DOWNLOADER" = "curl" ]; then
    curl -fsSL "$url"
  else
    wget -qO- "$url"
  fi
}

download_to_file() {
  local url="$1"
  local output="$2"
  if [ "$DOWNLOADER" = "curl" ]; then
    curl -fsSL "$url" -o "$output"
  else
    wget -q "$url" -O "$output"
  fi
}

download_with_progress() {
  local url="$1"
  local output="$2"
  if [ "$DOWNLOADER" = "curl" ]; then
    curl --fail --location --progress-bar "$url" -o "$output"
  else
    wget --show-progress -q "$url" -O "$output"
  fi
}

# --- musl detection ---

detect_musl() {
  # Method 1: Check Alpine release file
  if [ -f /etc/alpine-release ]; then
    return 0
  fi

  # Method 2: Check ldd version output
  if command -v ldd >/dev/null 2>&1; then
    if ldd --version 2>&1 | grep -qi musl; then
      return 0
    fi
  fi

  # Method 3: Check if /lib/ld-musl* exists
  if ls /lib/ld-musl-* >/dev/null 2>&1; then
    return 0
  fi

  return 1
}

# --- Platform detection ---

detect_platform() {
  local os arch

  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  arch=$(uname -m)

  case "$os" in
    darwin) os="darwin" ;;
    linux) os="linux" ;;
    *)
      error "Unsupported operating system: $os"
      ;;
  esac

  case "$arch" in
    x86_64 | amd64) arch="x64" ;;
    aarch64 | arm64) arch="arm64" ;;
    *)
      error "Unsupported architecture: $arch"
      ;;
  esac

  local platform="${os}-${arch}"

  # Append musl suffix for Linux musl environments
  if [ "$os" = "linux" ] && detect_musl; then
    platform="${platform}-musl"
    info "Detected musl libc environment"
  fi

  echo "$platform"
}

# --- SHA256 verification ---

detect_sha256_tool() {
  if command -v sha256sum >/dev/null 2>&1; then
    echo "sha256sum"
  elif command -v shasum >/dev/null 2>&1; then
    echo "shasum -a 256"
  else
    echo ""
  fi
}

calculate_sha256() {
  local file="$1"
  local sha_tool
  sha_tool=$(detect_sha256_tool)

  if [ -z "$sha_tool" ]; then
    echo ""
    return
  fi

  $sha_tool "$file" | cut -d ' ' -f 1
}

verify_checksum() {
  local binary_path="$1"
  local version="$2"
  local platform="$3"

  if [ "$CLIX_SKIP_CHECKSUM" = "true" ]; then
    info "Skipping checksum verification (CLIX_SKIP_CHECKSUM=true)"
    return 0
  fi

  local sha_tool
  sha_tool=$(detect_sha256_tool)

  if [ -z "$sha_tool" ]; then
    warn "No SHA256 tool found (sha256sum or shasum). Skipping verification."
    return 0
  fi

  info "Verifying checksum..."

  local checksums_url="https://github.com/${GITHUB_REPO}/releases/download/${version}/checksums.sha256"
  local checksums_file
  checksums_file=$(mktemp)

  if ! download_to_file "$checksums_url" "$checksums_file" 2>/dev/null; then
    warn "Could not download checksums file. Skipping verification."
    rm -f "$checksums_file"
    return 0
  fi

  local expected_hash
  expected_hash=$(grep "clix-${platform}$" "$checksums_file" | cut -d ' ' -f 1)
  rm -f "$checksums_file"

  if [ -z "$expected_hash" ]; then
    warn "No checksum found for platform: $platform. Skipping verification."
    return 0
  fi

  local actual_hash
  actual_hash=$(calculate_sha256 "$binary_path")

  if [ "$actual_hash" != "$expected_hash" ]; then
    error "Checksum verification failed!\n  Expected: $expected_hash\n  Got:      $actual_hash\n\nThe downloaded binary may be corrupted. Try again or use CLIX_SKIP_CHECKSUM=true to skip."
  fi

  info "Checksum verified successfully"
}

# --- PATH configuration ---

tildify() {
  if [[ $1 = $HOME/* ]]; then
    echo "${1/$HOME\//~/}"
  else
    echo "$1"
  fi
}

configure_zsh() {
  local install_dir="$1"
  local path_export="$2"
  local marker="$3"
  local config="$HOME/.zshrc"

  if [ -f "$config" ] && grep -q "$marker" "$config" 2>/dev/null; then
    info "PATH already configured in $(tildify "$config")"
    return 0
  fi

  if [ -w "$config" ] || [ ! -f "$config" ]; then
    {
      echo ""
      echo "$marker"
      echo "$path_export"
    } >> "$config"
    info "Added $(tildify "$install_dir") to \$PATH in $(tildify "$config")"
    echo ""
    info "Run 'source ~/.zshrc' or start a new terminal to use clix"
  else
    warn "Cannot write to $(tildify "$config"). Add manually:"
    echo "  $path_export"
  fi
}

configure_bash() {
  local install_dir="$1"
  local path_export="$2"
  local marker="$3"

  local configs=("$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile")

  for config in "${configs[@]}"; do
    if [ -f "$config" ] && grep -q "$marker" "$config" 2>/dev/null; then
      info "PATH already configured in $(tildify "$config")"
      return 0
    fi
  done

  for config in "${configs[@]}"; do
    if [ -w "$config" ] || ([ ! -f "$config" ] && [ -d "$(dirname "$config")" ]); then
      {
        echo ""
        echo "$marker"
        echo "$path_export"
      } >> "$config"
      info "Added $(tildify "$install_dir") to \$PATH in $(tildify "$config")"
      echo ""
      info "Run 'source $(tildify "$config")' or start a new terminal to use clix"
      return 0
    fi
  done

  warn "Cannot write to any bash config. Add manually:"
  echo "  $path_export"
}

configure_fish() {
  local install_dir="$1"
  local marker="$2"
  local config="$HOME/.config/fish/config.fish"

  if [ -f "$config" ] && grep -q "$marker" "$config" 2>/dev/null; then
    info "PATH already configured in $(tildify "$config")"
    return 0
  fi

  if [ -w "$config" ] || ([ ! -f "$config" ] && mkdir -p "$(dirname "$config")" 2>/dev/null); then
    {
      echo ""
      echo "$marker"
      echo "set -gx PATH \$PATH $install_dir"
    } >> "$config"
    info "Added $(tildify "$install_dir") to \$PATH in $(tildify "$config")"
    echo ""
    info "Run 'source $(tildify "$config")' or start a new terminal to use clix"
  else
    warn "Cannot write to $(tildify "$config"). Add manually:"
    echo "  set -gx PATH \$PATH $install_dir"
  fi
}

configure_path() {
  local install_dir="$1"

  # Check if already in PATH
  if [[ ":$PATH:" == *":$install_dir:"* ]]; then
    info "Directory already in PATH"
    return 0
  fi

  # Check opt-out
  if [ "$CLIX_NO_MODIFY_PATH" = "true" ]; then
    warn "Skipping PATH modification (CLIX_NO_MODIFY_PATH=true)"
    echo ""
    warn "Add the following to your shell profile manually:"
    echo "  export PATH=\"\$PATH:$install_dir\""
    return 0
  fi

  local shell_name
  shell_name=$(basename "$SHELL")

  local path_export="export PATH=\"\$PATH:$install_dir\""
  local marker="# clix"

  case "$shell_name" in
    zsh)
      configure_zsh "$install_dir" "$path_export" "$marker"
      ;;
    bash)
      configure_bash "$install_dir" "$path_export" "$marker"
      ;;
    fish)
      configure_fish "$install_dir" "$marker"
      ;;
    *)
      warn "Unknown shell: $shell_name"
      warn "Add the following to your shell profile:"
      echo "  $path_export"
      ;;
  esac
}

# --- Version fetching ---

get_latest_version() {
  local url="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
  local response version

  # Try to get latest stable release first
  response=$(download_to_stdout "$url" 2>/dev/null || echo "")

  if [ -n "$response" ]; then
    version=$(echo "$response" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
  fi

  # If no stable release, get the most recent release (including prereleases)
  if [ -z "$version" ]; then
    url="https://api.github.com/repos/${GITHUB_REPO}/releases"
    response=$(download_to_stdout "$url" 2>/dev/null || echo "")

    if [ -z "$response" ]; then
      error "Failed to fetch release information from GitHub"
    fi

    version=$(echo "$response" | grep '"tag_name":' | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
  fi

  if [ -z "$version" ]; then
    error "No releases found. Please specify a version with CLIX_VERSION=vX.Y.Z"
  fi

  echo "$version"
}

# --- Main installation ---

install_clix() {
  detect_downloader

  local platform version download_url binary_path

  platform=$(detect_platform)
  info "Detected platform: $platform"

  if [ "$CLIX_VERSION" = "latest" ]; then
    info "Fetching latest version..."
    version=$(get_latest_version)
  else
    version="$CLIX_VERSION"
  fi

  info "Installing Clix CLI ${version}..."

  download_url="https://github.com/${GITHUB_REPO}/releases/download/${version}/clix-${platform}"
  binary_path="$CLIX_INSTALL_DIR/clix"

  # Create install directory
  mkdir -p "$CLIX_INSTALL_DIR"

  # Download binary
  info "Downloading from ${download_url}..."
  if ! download_with_progress "$download_url" "$binary_path"; then
    error "Failed to download binary. Please check if the version and platform exist."
  fi

  # Verify checksum
  verify_checksum "$binary_path" "$version" "$platform"

  # Make executable
  chmod +x "$binary_path"

  info "Clix CLI installed to $binary_path"

  # Configure PATH
  configure_path "$CLIX_INSTALL_DIR"

  # Verify installation
  if [ -x "$binary_path" ]; then
    echo ""
    info "Installation complete! Run 'clix --help' to get started."
  else
    error "Installation failed. Binary not executable."
  fi
}

# Run installer
install_clix
