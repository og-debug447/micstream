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
                        mics: mics
                    });
                    
                    dbg('Found ' + mics.length + ' microphones');
                })
                .catch(function(error) {
                    dbg('Error enumerating devices: ' + error);
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
        } else {
            // Node.js environment - use system commands
            var os = require('os');
            var platform = os.platform();
            var exec = require('child_process').exec;
            
            if (platform === 'win32') {
                // Windows - use PowerShell to get audio devices
                exec('powershell -Command "Get-WmiObject Win32_SoundDevice | Where-Object {$_.ConfigManagerErrorCode -eq 0} | Select-Object Name"', function(error, stdout, stderr) {
                    var mics = [];
                    if (!error && stdout) {
                        var lines = stdout.split('\n');
                        lines.forEach(function(line) {
                            if (line.trim() && !line.includes('Name') && !line.includes('---')) {
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
                    
                    dbg('Found ' + mics.length + ' microphones on Windows');
                });
            } else if (platform === 'darwin') {
                // macOS - use system_profiler
                exec('system_profiler SPAudioDataType | grep -A 5 "Microphone"', function(error, stdout, stderr) {
                    var mics = [];
                    if (!error && stdout) {
                        var lines = stdout.split('\n');
                        lines.forEach(function(line) {
                            if (line.includes('Microphone') || line.includes('Input')) {
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
                    
                    dbg('Found ' + mics.length + ' microphones on macOS');
                });
            } else {
                // Linux - use arecord or pactl
                exec('pactl list sources short', function(error, stdout, stderr) {
                    var mics = [];
                    if (!error && stdout) {
                        var lines = stdout.split('\n');
                        lines.forEach(function(line) {
                            if (line.includes('input') || line.includes('alsa')) {
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
                        exec('arecord -l', function(error, stdout, stderr) {
                            if (!error && stdout) {
                                var lines = stdout.split('\n');
                                lines.forEach(function(line) {
                                    if (line.includes('card') && line.includes('device')) {
                                        mics.push({
                                            id: 'hw_' + line.match(/card (\d+):/)[1] + '_' + line.match(/device (\d+):/)[1],
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
                            
                            dbg('Found ' + mics.length + ' microphones on Linux');
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