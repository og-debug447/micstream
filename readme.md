# Microphone Stream Plugin for MeshCentral

A MeshCentral plugin that enables remote microphone streaming. Select a microphone, configure bitrate, and listen to audio from remote devices in real-time.

## Features

- **Microphone Selection**: Enumerate and select from available microphones on remote devices
- **Bitrate Configuration**: Choose audio quality from 64kbps to 320kbps
- **Real-time Streaming**: Listen to live audio from remote devices
- **Cross-platform Support**: Works on Windows, macOS, and Linux
- **Web UI Integration**: Easy-to-use interface integrated into MeshCentral
- **Permission-based Access**: Requires appropriate permissions to access microphone streaming

## Installation

### Prerequisites

1. Make sure you have plugins enabled for your MeshCentral installation by adding this to the settings section of your `meshcentral-data/config.json` file:

```json
"plugins": {
    "enabled": true
}
```

2. Restart your MeshCentral server after making this change.

### Plugin Installation

To install the plugin, add the plugin configuration URL when prompted in MeshCentral:

```
https://raw.githubusercontent.com/meshcentral/micstream/master/config.json
```

Alternatively, you can manually install the plugin by:

1. Download the plugin ZIP file
2. Extract it to your MeshCentral plugins directory
3. The plugin will appear in the plugin list

## Usage

### For Users

1. **Select a Device**: Navigate to the device you want to monitor in MeshCentral
2. **Open Microphone Stream**: Click on "Device Actions" > "Microphone Stream"
3. **Select Microphone**: Choose from the available microphones on the remote device
4. **Configure Bitrate**: Select your desired audio quality (64-320 kbps)
5. **Start Streaming**: Click "Start Streaming" to begin listening
6. **Listen**: Audio will play through your browser's audio player
7. **Stop Streaming**: Click "Stop Streaming" when done

### For Administrators

The plugin integrates with MeshCentral's permission system. Administrators can control who has access to microphone streaming through the standard MeshCentral permissions dialog.

## Requirements

### Server-side
- MeshCentral >= 1.1.35
- Plugins enabled in configuration

### Agent-side
- **Windows**: FFmpeg (optional, for enhanced audio capture)
- **macOS**: FFmpeg (optional, for enhanced audio capture)
- **Linux**: FFmpeg or ALSA/PulseAudio

### Client-side
- Modern web browser with Web Audio API support
- WebSocket support

## Configuration

The plugin uses the following default settings:

- **Default Bitrate**: 128 kbps
- **Sample Rate**: 44.1 kHz
- **Channels**: Mono (1 channel)
- **Audio Format**: PCM 16-bit

These can be modified in the plugin code if needed.

## Troubleshooting

### No microphones found
- Ensure the remote device has a working microphone
- Check browser permissions if using Electron-based agents
- Verify FFmpeg installation on the remote device

### Poor audio quality
- Try increasing the bitrate in the configuration
- Check network bandwidth between server and agent
- Ensure the remote device's microphone is not muted

### Stream fails to start
- Verify the agent is connected to the MeshCentral server
- Check browser console for error messages
- Ensure WebSocket connections are not blocked by firewalls

### Audio playback issues
- Ensure your browser supports Web Audio API
- Check that your system audio output is working
- Try a different browser if playback issues persist

## Security Considerations

- This plugin enables remote audio monitoring, which has privacy implications
- Always obtain appropriate consent before monitoring audio
- Use MeshCentral's permission system to control access
- Consider implementing additional logging for audit purposes
- Ensure your MeshCentral installation is properly secured

## Technical Details

### Architecture

The plugin consists of three main components:

1. **Server-side Plugin** (`micstream.js`): Handles plugin hooks, WebSocket communication, and web UI integration
2. **Agent Module** (`modules_meshcore/micstream.js`): Captures audio on the remote device and streams it to the server
3. **Web UI**: Provides user interface for microphone selection and stream control

### Audio Streaming

Audio is captured using:
- **Browser-based agents**: Web Audio API
- **Node.js agents**: FFmpeg or system audio APIs

Audio data is:
1. Captured as PCM 16-bit audio
2. Chunked and base64-encoded
3. Transmitted via WebSocket to the server
4. Forwarded to connected web clients
5. Decoded and played using HTML5 audio element

### Permissions

The plugin respects MeshCentral's permission system. Administrators can control access at:
- Global level (all users)
- Mesh level (device groups)
- Node level (individual devices)

## Development

### Building from Source

1. Clone the repository
2. Modify the plugin code as needed
3. Update the version in `config.json`
4. Update the changelog
5. Test thoroughly
6. Deploy to your MeshCentral installation

### Contributing

Contributions are welcome! Please ensure:
- Code follows existing patterns
- Changes are documented in the changelog
- Testing is performed on multiple platforms
- Security implications are considered

## License

Apache-2.0

## Author

MeshCentral Plugin Developer

## Support

For issues specific to this plugin, please check:
- This repository's issue tracker
- MeshCentral documentation
- MeshCentral community forums

Note: As with all MeshCentral plugins, this plugin receives no direct support from the main MeshCentral developers. Ensure plugins are disabled when troubleshooting MeshCentral core issues.