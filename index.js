import 'dotenv/config';
import * as si from "systeminformation";
//import { TuyaContext  } from '@tuya/tuya-connector-nodejs';
//import { cloudLogin, loginDevice } from "tp-link-tapo-connect";
//import SmartApp from "@smartthings/smartapp";
import {SmartThingsClient, BearerTokenAuthenticator} from '@smartthings/core-sdk'
import {showConsole, hideConsole} from "node-hide-console-window";
import * as fs from 'fs';

if (process.argv[2] == "hide") hideConsole();

let lastVal;
//let lock = false;
const limits = [30, 79];

/*
const context = new TuyaContext({
	baseUrl: 'https://openapi.tuyaus.com',
	accessKey: process.env.ACCESS_KEY,
	secretKey: process.env.SECRET_KEY,
});
*/

const client = new SmartThingsClient(new BearerTokenAuthenticator(process.env.SAMSUNG_TOKEN))

async function toggleSwitch(val) {
	/*return new Promise((resolve, reject) => {
		context.request({
			path: `/v1.0/iot-03/devices/${process.env.DEVICE_ID}/commands`,
			method: 'POST',
			body: {"commands":[{"code":process.env.COMMAND_CODE,"value":val}]}
		}).then(resolve).catch(reject);
	});*/
	
	//await device[val ? "turnOn" : "turnOff"]();
	console.log(await client.devices.executeCommands(device, [{component: "main", capability: "switch", command: val ? "on" : "off", arguments: []}]));
	writeLastState(val);
	console.log("Toggle");
	//c await loginDevice(process.env.TAPO_EMAIL, Buffer.from(process.env.TAPO_PASS, "base64").toString("utf8"));
}

/*
function getStatus() {
	return new Promise((resolve, reject) => {
		context.request({
			path: `/v1.0/iot-03/devices/${process.env.DEVICE_ID}/status`,
			method: 'GET'
		}).then(resolve).catch(reject);
	});
}
*/

let netErr = false;
let toSwitch;
let device;
let fetchedDevice = false;

const stateFile = "./.last_state";

function readLastState() {
	let ex = fs.existsSync(stateFile);
	if (ex) ex = fs.statSync(stateFile).isFile();
	if (ex) {
		let binary = fs.readFileSync(stateFile).toString("binary").charCodeAt(0);
		return binary > 0 ? true : false;
	}
	return lastVal;
}

function writeLastState(cState) {
	fs.writeFileSync(stateFile, Buffer.from([cState ? 1 : 0]));
}

async function main() {
	if (!fetchedDevice) {
		try {
			//const cloudApi = await cloudLogin(process.env.TAPO_EMAIL, Buffer.from(process.env.TAPO_PASS, "base64").toString("utf8"));
			//const deviceList = await cloudApi.listDevicesByType("SMART.TAPOPLUG");
			//device = deviceList.filter(a => a.alias == "SP1")[0];
			let devices = await client.devices.list();
			let tmpDevice = devices.filter(a => a.label == "SP1")[0];
			if (tmpDevice.label != "SP1") throw "Plug undetected.";
			//device = "";
			device = tmpDevice.deviceId;
			let health = await client.devices.getHealth(device);
			if (health.state != "ONLINE") {
				device = null;
				throw "Plug undetected.";
			}
			console.log("Connected.");
			await toggleSwitch(lastVal);
			fetchedDevice = true;
		} catch(e) {
			console.log(e);
		}
	} else {
		if (netErr) {
			try {
				await toggleSwitch(toSwitch);
				netErr = false;
			} catch(e) {};
		}
		let battery = await si.battery();
		console.log(battery.isCharging);
		switch (battery.isCharging) {
			case true:
					if (battery.percent >= limits[1] || !(netErr || lastVal)) {
						try {
							await toggleSwitch(lastVal = false);
							netErr = false;
						} catch(e) {
							netErr = true;
							toSwitch = lastVal;
						}
					}
				break;
			default:
					if (battery.percent <= limits[0] || !(netErr || !lastVal)) {
						try {
							await toggleSwitch(lastVal = true);
							netErr = false;
						} catch(e) {
							netErr = true;
							toSwitch = lastVal;
						}
					}
				break;
		}
	}
	console.log("Called main");
	setTimeout(() => { setImmediate(main) }, 5000);
}

function startPoint() {
	si.battery().then((batInfo) => {
		lastVal = batInfo.isCharging;
		lastVal = readLastState();
		console.log(lastVal);
		writeLastState(lastVal);
		try {
			setImmediate(main);
		} catch(e) {
			throw e;
		}
	}).catch(err => {
		console.log("Battery collect problem");
		setTimeout(() => { setImmediate(startPoint) }, 10000);
	});
}

setImmediate(startPoint);