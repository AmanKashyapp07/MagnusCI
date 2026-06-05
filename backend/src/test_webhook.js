const crypto = require("crypto");

const webhookUrl = "http://localhost:5001/api/webhooks/github";
const secret = process.env.GITHUB_WEBHOOK_SECRET || ""; // Optional secret matching .env

const payload = {
  after: "87c9bc3da38f12a80693aef4c78d59ad02a6c1e5", // Fake commit hash
  repository: {
    name: "test-auto-build-app",
    clone_url: "https://github.com/amankashyap/test-auto-build-app.git",
  },
};

const payloadString = JSON.stringify(payload);

// Calculate signature if secret is present
const headers = {
  "Content-Type": "application/json",
  "X-GitHub-Event": "push",
};

if (secret) {
  const hmac = crypto.createHmac("sha256", secret);
  const digest = "sha256=" + hmac.update(payloadString).digest("hex");
  headers["X-Hub-Signature-256"] = digest;
  console.log("Calculated signature:", digest);
} else {
  console.log("No GITHUB_WEBHOOK_SECRET env variable. Sending signature-less payload.");
}

console.log("Sending mock push webhook event to:", webhookUrl);

fetch(webhookUrl, {
  method: "POST",
  headers: headers,
  body: payloadString,
})
  .then(async (res) => {
    console.log("Response Status:", res.status);
    const body = await res.json();
    console.log("Response Body:", body);
  })
  .catch((err) => {
    console.error("Fetch error:", err);
  });
