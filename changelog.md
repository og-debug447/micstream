# Changelog

All notable changes to the Microphone Stream plugin will be documented in this file.

## [0.2.0] - 2026-10-06

### Fixed
- **Windows microphone detection**: Replaced deprecated PowerShell command with Get-CimInstance and added input device filtering
- **Browser/Electron agents**: Added explicit microphone permission request before enumeration to get actual device labels
- **macOS microphone detection**: Improved parsing to identify input devices section specifically
- **Linux microphone detection**: Added filter to exclude monitor devices and improved command fallback chain
- **Node ID consistency**: Store mic lists with both nodeid and dbNodeKey for compatibility
- **Viewmode context**: Added viewmode detection and proper target node ID handling
- **Session management**: Find current user's session by userid instead of using first session
- **Agent lookup**: Added multiple lookup strategies to find agents regardless of ID type

### Added
- Comprehensive fallback mechanisms for microphone detection on all platforms
- Extensive console logging for debugging microphone and viewmode issues
- Documentation files: ISSUES_ANALYSIS.md and CHANGES_SUMMARY.md
- Backup directory for original files

## [0.1.0] - 2026-09-24

### Added
- Initial release of Microphone Stream plugin
- Microphone enumeration and selection
- Bitrate configuration (64kbps to 320kbps)
- Real-time audio streaming from remote devices
- Web UI for microphone selection and stream control
- Cross-platform support (Windows, macOS, Linux)
- Agent-side audio capture using Web Audio API or FFmpeg
- WebSocket-based audio data transmission
- Stream status monitoring and error handling