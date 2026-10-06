/**
* @description MeshCentral Microphone Stream Plugin - Agent Module
* @author MeshCentral Plugin Developer
* @copyright 
* @license Apache-2.0
* @version v0.1.0
*/

"use strict";

var mesh;
var obj = this;
var _sessionid;
var debug_flag = false;
var activeStream = null;
var audioContext = null;
var mediaStream = null;
var scriptProcessor = null;
var audioEncoder = null;

var dbg = function(str) {
    if (debug_flag !== true) return;
    var fs = require('fs');
    var logStream = fs.createWriteStream('micstream.txt', {'flags': 'a'});
    logStream.write('\n' + new Date().toLocaleString() + ': ' + str);
    logStream.end('\n');
};

function consoleaction(args, rights, sessionid, parent) {
    _sessionid = sessionid;
    mesh = parent;
    
    var fnname = args.pluginaction;
    dbg('Received action: ' + fnname);
    
    switch (fnname) {
        case 'getMicList':
            getMicrophoneList();
            break;
            
        case 'startStream':
            startAudioStream(args.micId, args.bitrate);
            break;
            
        case 'stopStream':
            stopAudioStream();
            break;
            
        default:
            dbg('Unknown action: ' + fnname);
            break;
    }
}

function getMicrophoneList() {
    try {
        // Check if we're in a browser environment (Electron renderer)
        if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
            // Request microphone permission first to get device labels
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(function(stream) {
                    // Stop the stream immediately, we just needed permission
                    stream.getTracks().forEach(function(track) {
                        track.stop();
                    });
                    
                    // Now enumerate devices with labels
                    return navigator.mediaDevices.enumerateDevices();
                })
                .then(function(devices) {
                    var mics = [];
                    devices.forEach(function(device) {
                        if (device.kind === 'audioinput') {
                            mics.push({
                                id: device.deviceId,
                                name: device.label || 'Microphone ' + (mics.length + 1)
                            });
                        }
                    });
                    
                    mesh.SendCommand({
                        action: 'plugin',
                        plugin: 'micstream',
                        pluginaction: 'micList',
                        sessionid: _sessionid,
                        tag: 'console',
                        mics: mics
                    });
                    
                    dbg('Found ' + mics.length + ' microphones');
                })
                .catch(function(error) {
                    dbg('Error enumerating devices: ' + error);
                    // Try enumeration without permission (will have empty labels)
                    navigator.mediaDevices.enumerateDevices()
                        .then(function(devices) {
                            var mics = [];
                            devices.forEach(function(device) {
                                if (device.kind === 'audioinput') {
                                    mics.push({
                                        id: device.deviceId,
                                        name: device.label || 'Microphone ' + (mics.length + 1)
                                    });
                                }
                            });
                            
                            mesh.SendCommand({
                                action: 'plugin',
                                plugin: 'micstream',
                                pluginaction: 'micList',
                                sessionid: _sessionid,
                                tag: 'console',
                                mics: mics,
                                error: 'Permission denied, generic names used'
                            });
                            
                            dbg('Found ' + mics.length + ' microphones (no permission)');
                        })
                        .catch(function(enumError) {
                            dbg('Error enumerating without permission: ' + enumError);
                            mesh.SendCommand({
                                action: 'plugin',
                                plugin: 'micstream',
                                pluginaction: 'micList',
                                sessionid: _sessionid,
                                tag: 'console',
                                mics: [],
                                error: error.message
                            });
                        });
                });
        } else {
            // Node.js environment - use system commands
            var os = require('os');
            var platform = os.platform();
            var exec = require('child_process').exec;
            
            if (platform === 'win32') {
                // Windows - use PowerShell to get audio input devices only
                exec('powershell -Command "Get-CimInstance Win32_SoundDevice | Where-Object {$_.ConfigManagerErrorCode -eq 0 -and ($_.Name -like \'*mic*\' -or $_.Name -like \'*input*\' -or $_.Name -like \'*recording*\')} | Select-Object Name"', function(error, stdout, stderr) {
                    var mics = [];
                    if (!error && stdout) {
                        var lines = stdout.split('\n');
                        lines.forEach(function(line) {
                            if (line.trim() && !line.includes('Name') && !line.includes('---') && !line.includes('PS')) {
                                mics.push({
                                    id: 'mic_' + mics.length,
                                    name: line.trim()
                                });
                            }
                        });
                    }
                    
                    // Fallback: Try alternative method if no devices found
                    if (mics.length === 0) {
                        exec('powershell -Command "Get-PnpDevice -Class Audio | Where-Object {$_.Status -eq \'OK\' -and ($_.FriendlyName -like \'*mic*\' -or $_.FriendlyName -like \'*input*\')} | Select-Object FriendlyName"', function(error2, stdout2, stderr2) {
                            if (!error2 && stdout2) {
                                var lines2 = stdout2.split('\n');
                                lines2.forEach(function(line) {
                                    if (line.trim() && !line.includes('FriendlyName') && !line.includes('---') && !line.includes('PS')) {
                                        mics.push({
                                            id: 'mic_' + mics.length,
                                            name: line.trim()
                                        });
                                    }
                                });
                            }
                            
                            mesh.SendCommand({
                                action: 'plugin',
                                plugin: 'micstream',
                                pluginaction: 'micList',
                                sessionid: _sessionid,
                                tag: 'console',
                                mics: mics
                            });
                            
                            dbg('Found ' + mics.length + ' microphones on Windows (fallback)');
                        });
                    } else {
                        mesh.SendCommand({
                            action: 'plugin',
                            plugin: 'micstream',
                            pluginaction: 'micList',
                            sessionid: _sessionid,
                            tag: 'console',
                            mics: mics
                        });
                        
                        dbg('Found ' + mics.length + ' microphones on Windows');
                    }
                });
            } else if (platform === 'darwin') {
                // macOS - use system_profiler with better parsing
                exec('system_profiler SPAudioDataType', function(error, stdout, stderr) {
                    var mics = [];
                    if (!error && stdout) {
                        var lines = stdout.split('\n');
                        var inInputSection = false;
                        lines.forEach(function(line) {
                            if (line.includes('Input Devices:')) {
                                inInputSection = true;
                            } else if (line.includes('Output Devices:') || line.match(/^\s*$/)) {
                                inInputSection = false;
                            } else if (inInputSection && line.trim() && !line.includes('Input Devices:')) {
                                var match = line.match(/^\s*(.+):\s*$/);
                                if (match) {
                                    mics.push({
                                        id: 'mic_' + mics.length,
                                        name: match[1].trim()
                                    });
                                }
                            }
                        });
                    }
                    
                    // Fallback: Try older method if no devices found
                    if (mics.length === 0) {
                        exec('system_profiler SPAudioDataType | grep -i "microphone\|input"', function(error2, stdout2, stderr2) {
                            if (!error2 && stdout2) {
                                var lines2 = stdout2.split('\n');
                                lines2.forEach(function(line) {
                                    if (line.trim() && !line.includes('---')) {
                                        mics.push({
                                            id: 'mic_' + mics.length,
                                            name: line.trim()
                                        });
                                    }
                                });
                            }
                            
                            mesh.SendCommand({
                                action: 'plugin',
                                plugin: 'micstream',
                                pluginaction: 'micList',
                                sessionid: _sessionid,
                                tag: 'console',
                                mics: mics
                            });
                            
                            dbg('Found ' + mics.length + ' microphones on macOS (fallback)');
                        });
                    } else {
                        mesh.SendCommand({
                            action: 'plugin',
                            plugin: 'micstream',
                            pluginaction: 'micList',
                            sessionid: _sessionid,
                            tag: 'console',
                            mics: mics
                        });
                        
                        dbg('Found ' + mics.length + ' microphones on macOS');
                    }
                });
            } else {
                // Linux - use arecord or pactl
                exec('pactl list sources short', function(error, stdout, stderr) {
                    var mics = [];
                    if (!error && stdout) {
                        var lines = stdout.split('\n');
                        lines.forEach(function(line) {
                            // Look for input sources (not monitors)
                            if (line.trim() && !line.includes('.monitor')) {
                                var parts = line.split('\t');
                                if (parts.length > 1) {
                                    mics.push({
                                        id: parts[0],
                                        name: parts[1] || 'Microphone ' + (mics.length + 1)
                                    });
                                }
                            }
                        });
                    }
                    
                    if (mics.length === 0) {
                        // Fallback to arecord
                        exec('arecord -l', function(error2, stdout2, stderr2) {
                            if (!error2 && stdout2) {
                                var lines2 = stdout2.split('\n');
                                lines2.forEach(function(line) {
                                    if (line.includes('card') && line.includes('device')) {
                                        var cardMatch = line.match(/card (\d+):/);
                                        var deviceMatch = line.match(/device (\d+):/);
                                        if (cardMatch && deviceMatch) {
                                            mics.push({
                                                id: 'hw_' + cardMatch[1] + '_' + deviceMatch[1],
                                                name: line.trim()
                                            });
                                        }
                                    }
                                });
                            }
                            
                            mesh.SendCommand({
                                action: 'plugin',
                                plugin: 'micstream',
                                pluginaction: 'micList',
                                sessionid: _sessionid,
                                tag: 'console',
                                mics: mics
                            });
                            
                            dbg('Found ' + mics.length + ' microphones on Linux (fallback)');
                        });
                    } else {
                        mesh.SendCommand({
                            action: 'plugin',
                            plugin: 'micstream',
                            pluginaction: 'micList',
                            sessionid: _sessionid,
                            tag: 'console',
                            mics: mics
                        });
                        
                        dbg('Found ' + mics.length + ' microphones on Linux');
                    }
                });
            }
        }
    } catch (e) {
        dbg('Error getting microphone list: ' + e);
        mesh.SendCommand({
            action: 'plugin',
            plugin: 'micstream',
            pluginaction: 'micList',
            sessionid: _sessionid,
            tag: 'console',
            mics: [],
            error: e.message
        });
    }
}

function startAudioStream(micId, bitrate) {
    try {
        if (activeStream) {
            dbg('Stream already active, stopping first');
            stopAudioStream();
        }
        
        // Check if we're in a browser environment
        if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
            // Browser-based audio capture
            var constraints = {
                audio: {
                    deviceId: micId ? { exact: micId } : undefined,
                    channelCount: 1,
                    sampleRate: 44100,
                    sampleSize: 16,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };
            
            navigator.mediaDevices.getUserMedia(constraints)
                .then(function(stream) {
                    mediaStream = stream;
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    var source = audioContext.createMediaStreamSource(stream);
                    
                    // Create script processor for audio data
                    var bufferSize = 4096;
                    scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
                    
                    scriptProcessor.onaudioprocess = function(e) {
                        var inputData = e.inputBuffer.getChannelData(0);
                        var pcmData = new Int16Array(inputData.length);
                        
                        // Convert float to 16-bit PCM
                        for (var i = 0; i < inputData.length; i++) {
                            var s = Math.max(-1, Math.min(1, inputData[i]));
                            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                        }
                        
                        // Send audio data to server
                        sendAudioData(pcmData.buffer);
                    };
                    
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(audioContext.destination);
                    
                    activeStream = {
                        micId: micId,
                        bitrate: bitrate,
                        startTime: Date.now()
                    };
                    
                    mesh.SendCommand({
                        action: 'plugin',
                        plugin: 'micstream',
                        pluginaction: 'streamStarted',
                        sessionid: _sessionid,
                        tag: 'console',
                        micId: micId,
                        bitrate: bitrate
                    });
                    
                    dbg('Audio stream started with bitrate: ' + bitrate);
                })
                .catch(function(error) {
                    dbg('Error starting audio stream: ' + error);
                    mesh.SendCommand({
                        action: 'plugin',
                        plugin: 'micstream',
                        pluginaction: 'streamError',
                        sessionid: _sessionid,
                        tag: 'console',
                        error: error.message
                    });
                });
        } else {
            // Node.js environment - use FFmpeg or similar
            var os = require('os');
            var platform = os.platform();
            var spawn = require('child_process').spawn;
            
            var ffmpegArgs = [
                '-f', platform === 'win32' ? 'dshow' : (platform === 'darwin' ? 'avfoundation' : 'alsa'),
                '-i', micId || 'default',
                '-ar', '44100',
                '-ac', '1',
                '-f', 'wav',
                '-codec:a', 'pcm_s16le',
                '-b:a', bitrate.toString(),
                '-'
            ];
            
            if (platform === 'win32') {
                ffmpegArgs = [
                    '-f', 'dshow',
                    '-i', 'audio=' + (micId || 'default'),
                    '-ar', '44100',
                    '-ac', '1',
                    '-f', 'wav',
                    '-codec:a', 'pcm_s16le',
                    '-b:a', bitrate.toString(),
                    '-'
                ];
            }
            
            var ffmpeg = spawn('ffmpeg', ffmpegArgs);
            
            ffmpeg.stdout.on('data', function(data) {
                sendAudioData(data);
            });
            
            ffmpeg.stderr.on('data', function(data) {
                dbg('FFmpeg stderr: ' + data);
            });
            
            ffmpeg.on('close', function(code) {
                dbg('FFmpeg process exited with code: ' + code);
                stopAudioStream();
            });
            
            activeStream = {
                micId: micId,
                bitrate: bitrate,
                startTime: Date.now(),
                process: ffmpeg
            };
            
            mesh.SendCommand({
                action: 'plugin',
                plugin: 'micstream',
                pluginaction: 'streamStarted',
                sessionid: _sessionid,
                tag: 'console',
                micId: micId,
                bitrate: bitrate
            });
            
            dbg('Audio stream started with FFmpeg, bitrate: ' + bitrate);
        }
    } catch (e) {
        dbg('Error starting audio stream: ' + e);
        mesh.SendCommand({
            action: 'plugin',
            plugin: 'micstream',
            pluginaction: 'streamError',
            sessionid: _sessionid,
            tag: 'console',
            error: e.message
        });
    }
}

function stopAudioStream() {
    try {
        if (activeStream) {
            if (mediaStream) {
                mediaStream.getTracks().forEach(function(track) {
                    track.stop();
                });
                mediaStream = null;
            }
            
            if (audioContext) {
                audioContext.close();
                audioContext = null;
            }
            
            if (scriptProcessor) {
                scriptProcessor.disconnect();
                scriptProcessor = null;
            }
            
            if (activeStream.process) {
                activeStream.process.kill();
            }
            
            activeStream = null;
            
            mesh.SendCommand({
                action: 'plugin',
                plugin: 'micstream',
                pluginaction: 'streamStopped',
                sessionid: _sessionid,
                tag: 'console'
            });
            
            dbg('Audio stream stopped');
        }
    } catch (e) {
        dbg('Error stopping audio stream: ' + e);
    }
}

function sendAudioData(buffer) {
    try {
        // Convert buffer to base64 for transmission
        var base64Data = Buffer.from(buffer).toString('base64');
        
        // Send in chunks to avoid oversized messages
        var chunkSize = 8192; // 8KB chunks
        for (var i = 0; i < base64Data.length; i += chunkSize) {
            var chunk = base64Data.substring(i, i + chunkSize);
            mesh.SendCommand({
                action: 'plugin',
                plugin: 'micstream',
                pluginaction: 'audioData',
                sessionid: _sessionid,
                tag: 'console',
                data: chunk,
                chunk: true,
                finalChunk: (i + chunkSize >= base64Data.length)
            });
        }
    } catch (e) {
        dbg('Error sending audio data: ' + e);
    }
}