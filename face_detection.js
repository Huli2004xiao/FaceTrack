import DeviceDetector from "https://cdn.skypack.dev/device-detector-js@2.2.10";

// 添加ESP32配置
const ESP32_IP = "192.168.1.100"; // 请修改为您的ESP32 IP地址
const ESP32_PORT = "80"; // 请修改为您的ESP32端口
const ESP32_URL = `http://${ESP32_IP}:${ESP32_PORT}/face-data`;

// 添加状态显示元素
const statusElement = document.createElement('div');
statusElement.className = 'status-display';
statusElement.innerHTML = '状态: 等待人脸检测';
document.body.appendChild(statusElement);

// Usage: testSupport({client?: string, os?: string}[])
// Client and os are regular expressions.
// See: https://cdn.jsdelivr.net/npm/device-detector-js@2.2.10/README.md for
// legal values for client and os
testSupport([
    { client: 'Chrome' },
]);

function testSupport(supportedDevices) {
    const deviceDetector = new DeviceDetector();
    const detectedDevice = deviceDetector.parse(navigator.userAgent);
    let isSupported = false;
    for (const device of supportedDevices) {
        if (device.client !== undefined) {
            const re = new RegExp(`^${device.client}$`);
            if (!re.test(detectedDevice.client.name)) {
                continue;
            }
        }
        if (device.os !== undefined) {
            const re = new RegExp(`^${device.os}$`);
            if (!re.test(detectedDevice.os.name)) {
                continue;
            }
        }
        isSupported = true;
        break;
    }
    if (!isSupported) {
        alert(`This demo, running on ${detectedDevice.client.name}/${detectedDevice.os.name}, ` +
            `is not well supported at this time, continue at your own risk.`);
    }
}

/**
 * @fileoverview Demonstrates a minimal use case for MediaPipe face tracking.
 */
const controls = window;
const drawingUtils = window;
const mpFaceDetection = window;
// Our input frames will come from here.
const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const controlsElement = document.getElementsByClassName('control-panel')[0];
const canvasCtx = canvasElement.getContext('2d');

// 添加发送数据的函数
async function sendFaceDataToESP32(landmarks) {
    try {
        const response = await fetch(ESP32_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                landmarks: landmarks,
                timestamp: Date.now()
            })
        });

        if (response.ok) {
            statusElement.innerHTML = `状态: 数据已发送 (${new Date().toLocaleTimeString()})`;
            statusElement.style.color = '#4CAF50';
        } else {
            statusElement.innerHTML = '状态: 发送失败';
            statusElement.style.color = '#f44336';
        }
    } catch (error) {
        console.error('发送数据到ESP32失败:', error);
        statusElement.innerHTML = '状态: 连接失败';
        statusElement.style.color = '#f44336';
    }
}

// We'll add this to our control panel later, but we'll save it here so we can
// call tick() each time the graph runs.
const fpsControl = new controls.FPS();
// Optimization: Turn off animated spinner after its hiding animation is done.
const spinner = document.querySelector('.loading');
spinner.ontransitionend = () => {
    spinner.style.display = 'none';
};

function onResults(results) {
    // Hide the spinner.
    document.body.classList.add('loaded');
    // Update the frame rate.
    fpsControl.tick();
    // Draw the overlays.
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.detections.length > 0) {
        drawingUtils.drawRectangle(canvasCtx, results.detections[0].boundingBox, { color: 'blue', lineWidth: 4, fillColor: '#00000000' });
        drawingUtils.drawLandmarks(canvasCtx, results.detections[0].landmarks, {
            color: 'red',
            radius: 5,
        });

        // 获取归一化的面部特征坐标并发送到ESP32
        const normalizedLandmarks = results.detections[0].landmarks.map(landmark => ({
            x: landmark.x,
            y: landmark.y,
            z: landmark.z || 0
        }));

        sendFaceDataToESP32(normalizedLandmarks);
        statusElement.innerHTML = `状态: 检测到人脸，正在发送数据...`;
        statusElement.style.color = '#2196F3';

    } else {
        // 没有人脸时发送中心点数据
        const centerPoint = [{ x: 0.5, y: 0.5, z: 0 }];
        sendFaceDataToESP32(centerPoint);
        statusElement.innerHTML = '状态: 未检测到人脸，发送中心点';
        statusElement.style.color = '#FF9800';
    }

    canvasCtx.restore();
}

const faceDetection = new mpFaceDetection.FaceDetection({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4/${file}`;
    }
});
faceDetection.onResults(onResults);

// Present a control panel through which the user can manipulate the solution
// options.
new controls
    .ControlPanel(controlsElement, {
        selfieMode: true,
        model: 'short',
        minDetectionConfidence: 0.5,
    })
    .add([
        new controls.StaticText({ title: 'MediaPipe Face Detection' }),
        fpsControl,
        new controls.Toggle({ title: 'Selfie Mode', field: 'selfieMode' }),
        new controls.SourcePicker({
            onSourceChanged: () => {
                faceDetection.reset();
            },
            onFrame: async (input, size) => {
                const aspect = size.height / size.width;
                let width, height;
                if (window.innerWidth > window.innerHeight) {
                    height = window.innerHeight;
                    width = height / aspect;
                }
                else {
                    width = window.innerWidth;
                    height = width * aspect;
                }
                canvasElement.width = width;
                canvasElement.height = height;
                await faceDetection.send({ image: input });
            },
            examples: {
                images: [],
                videos: [],
            },
        }),
        new controls.Slider({
            title: 'Model Selection',
            field: 'model',
            discrete: { 'short': 'Short-Range', 'full': 'Full-Range' },
        }),
        new controls.Slider({
            title: 'Min Detection Confidence',
            field: 'minDetectionConfidence',
            range: [0, 1],
            step: 0.01
        }),
    ])
    .on(x => {
        const options = x;
        videoElement.classList.toggle('selfie', options.selfieMode);
        faceDetection.setOptions(options);
    });