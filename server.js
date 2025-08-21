const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  throw new Error("The FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set.");
}
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

app.post("/create-student", async (req, res) => {
  const idToken = req.headers.authorization?.split("Bearer ")[1];
  if (!idToken) {
    return res.status(401).send({ success: false, message: "Authentication token is required." });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const callerUid = decodedToken.uid;

    const userDoc = await db.collection("users").doc(callerUid).get();
    if (!userDoc.exists || userDoc.data().role !== "admin") {
      return res.status(403).send({ success: false, message: "Permission denied. Only admins can create users." });
    }

    const { name, regNo, yearStudying, department, domain, teamName } = req.body;
    const username = req.body.username.toLowerCase().trim();
    const email = `${username}@colearn.in`;

    let password = "";
    const match = regNo.match(/\d{4}(\w+)/);
    if (match && match[0].length >= 4) {
        password = match[0].substring(2);
    } else {
        password = regNo.slice(-8);
    }

    const userRecord = await admin.auth().createUser({ email, password, displayName: name });

    await db.collection("users").doc(userRecord.uid).set({ role: "student" });
    await db.collection("students").doc(userRecord.uid).set({
        name, regNo, username, yearStudying, department, domain, teamName: teamName || ""
    });

    return res.status(200).send({ success: true, message: `Successfully created user ${email}. Password is ${password}` });

  } catch (error) {
    console.error("Error in /create-student endpoint:", error);
    if (error.code === "auth/email-already-exists") {
        return res.status(409).send({ success: false, message: `The username '${req.body.username}' is already in use.` });
    }
    return res.status(500).send({ success: false, message: "An internal server error occurred." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});