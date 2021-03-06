import { execSync } from "child_process";
import { KeyRing, KeyRingUtils } from "libvex-keyring";
import { v4 as uuidv4 } from "uuid";
import { Client, IChatMessage } from "../src/Client";

setTimeout(() => {
  console.log("Timeout reached, tests failed.");
  process.exit(1);
}, 10000);

const keyring = new KeyRing(":memory:");

let output = "";

output += execSync("git branch -v");
output += execSync("git log -n 1");

const versionInfo = output;

output += "\nNODEJS VERSION:\n";
output += execSync("node --version");
output += "KERNEL VERSION:\n";
output += execSync("uname -r");

console.log(output);

keyring.on("ready", () => {
  const keys = {
    privkey: KeyRingUtils.encodeHex(keyring.getPriv()),
    pubkey: KeyRingUtils.encodeHex(keyring.getPub()),
  };
  diagPrint("KEYS", keys);
});

const vexClient = new Client("us2.vex.chat", keyring, null, true);

const testID = uuidv4();
console.log("TEST ID", testID);

vexClient.on("authed", async () => {
  console.log("Authed evente fired!");
});

vexClient.on("ready", async () => {
  try {
    const account = await vexClient.register();
    diagPrint("ACCOUNT INFO", account);
    const serverPubkey = await vexClient.auth();
    diagPrint("SERVER INFO", { serverPubkey });

    diagPrint("CLIENT INFO", vexClient.user!);

    const channelList = await vexClient.channels.retrieve();

    let channel;

    for (const ch of channelList) {
      diagPrint("AVAILABLE CHANNEL", ch);
      if (ch.name === "ci_tests") {
        channel = ch;
      }
    }

    if (!channel) {
      throw new Error("Couldn't find the channel!");
    }

    await vexClient.channels.join(channel.channelID);
    diagPrint("JOINED CHANNEL", channel);

    const onlineList = await vexClient.channels.active(channel.channelID);
    for (const user of onlineList) {
      diagPrint("ONLINE USER LIST", user);
    }

    const uploadedFile = await vexClient.files.create(
      Buffer.from(output),
      "LICENSE",
      channel.channelID
    );
    await vexClient.messages.send(
      channel.channelID,
      `\`\`\`${"libvex-js\n" +
        versionInfo}\`\`\` \n [CI Test Results ${new Date(
        Date.now()
      ).toUTCString()}](${uploadedFile.url})`
    );
    diagPrint("UPLOADED FILE", uploadedFile);
  } catch (error) {
    console.warn(error);
    console.warn("Tests failed.");
    process.exit(1);
  }
});

vexClient.on("message", async (message: IChatMessage) => {
  if (message.userID === vexClient.user!.userID) {
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
