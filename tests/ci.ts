import fs, { createReadStream } from "fs";
import { v4 as uuidv4 } from "uuid";
import { Client, IChatMessage } from "../src/Client";
import { KeyRing } from "../src/Keyring";
import { Utils } from "../src/Utils";

const keyring = new KeyRing(":memory:");

const file = fs.readFileSync("./LICENSE");

let output = "";

keyring.on("ready", () => {
  const keys = {
    pubkey: Utils.toHexString(keyring.getPub()),
    privkey: Utils.toHexString(keyring.getPriv()),
  };
  diagPrint("keys", keys);
});

const vexClient = new Client("dev.vex.chat", keyring, null, true);

const testID = uuidv4();
console.log("TEST ID", testID);

vexClient.on("ready", async () => {
  try {
    const account = await vexClient.register();
    diagPrint("ACCOUNT INFO", account);
    const serverPubkey = await vexClient.auth();
    diagPrint("SERVER INFO", { serverPubkey });

    diagPrint("CLIENT INFO", vexClient.info());

    const channelList = await vexClient.channels.retrieve();

    const [channel] = channelList;

    for (const ch of channelList) {
      diagPrint("AVAILABLE CHANNEL", ch);
    }

    await vexClient.channels.join(channel.channelID);
    diagPrint("JOINED CHANNEL", channel);

    const onlineList = await vexClient.channels.active(channel.channelID);
    for (const user of onlineList) {
      diagPrint("ONLINE USER LIST", user);
    }

    const uploadedFile = await vexClient.files.create(
      file,
      "LICENSE",
      channel.channelID
    );
    diagPrint("UPLOADED FILE", uploadedFile);
    await vexClient.messages.send(
      channel.channelID,
      "```\n" + output + "\n```"
    );
  } catch (error) {
    console.warn(error);
    console.warn("Tests failed.");
    process.exit(1);
  }
});

vexClient.on("message", async (message: IChatMessage) => {
  if (message.userID === vexClient.info().client!.userID) {
    console.log("All tests passed.");
    process.exit(0);
  }
});

vexClient.on("error", (error: any) => {
  console.log(error);
});

function diagPrint(name: string, object: Record<string, any>) {
  console.log("--------" + name + "---------");
  output += "--------" + name + "---------" + "\n";
  // tslint:disable-next-line: forin
  for (const key in object) {
    output += key.toUpperCase() + " " + object[key] + "\n";
    console.log(key.toUpperCase(), object[key]);
  }
}
