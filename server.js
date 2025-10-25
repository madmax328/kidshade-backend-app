// =======================================================
// KidShade Backend (Express + Socket.io + MongoDB Atlas)
// =======================================================
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const crypto = require("crypto");
require("dotenv").config();

// =======================================================
// 🔹 Initialisation serveur
// =======================================================
const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST", "PUT", "DELETE"] },
});

// =======================================================
// 🔹 Connexion MongoDB Atlas
// =======================================================
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connecté à MongoDB Atlas"))
  .catch((err) => console.error("❌ Erreur connexion MongoDB:", err));

// =======================================================
// 🔹 Middleware
// =======================================================
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Petit endpoint santé
app.get("/", (_req, res) => res.send("✅ KidShade backend up and running 🚀"));

// =======================================================
// 🔹 Modèles Mongoose
// =======================================================
const parentSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true },
    password: String,
    photo: String,
    children: [
      {
        name: String,
        photo: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

const zoneSchema = new mongoose.Schema(
  {
    parentId: String,
    childId: { type: String, default: null },
    name: String,
    center: {
      lat: Number,
      lng: Number,
    },
    radius: Number,
    color: String,
    enabled: Boolean,
  },
  { timestamps: true }
);

const Parent = mongoose.model("Parent", parentSchema);
const Zone = mongoose.model("Zone", zoneSchema);

// =======================================================
// 🔹 Multer (uploads)
// =======================================================
const storage = multer.diskStorage({
  destination: "./uploads",
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// =======================================================
// 🔹 Variables en mémoire
// =======================================================
const lastLocations = new Map();
const history = new Map();
const MAX_HISTORY = 100;
const zoneState = new Map();
const shares = new Map();
const sharesByChild = new Map();

// =======================================================
// 🔹 Socket.io
// =======================================================
io.on("connection", (socket) => {
  console.log("🟢 Client connecté:", socket.id);

  socket.on("joinParent", (parentId) => socket.join(`parent:${parentId}`));
  socket.on("joinShare", (token) => socket.join(`share:${token}`));

  socket.on("locationUpdate", (data) => handleIncomingLocation(data, "SOCKET"));
  socket.on("disconnect", () =>
    console.log("🔴 Client déconnecté:", socket.id)
  );
});

// =======================================================
// 🔹 Fonctions utilitaires
// =======================================================
function distanceMeters(a, b) {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const aa =
    s1 * s1 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

function handleIncomingLocation(payload, via = "HTTP") {
  const { childId, parentId, coords } = payload;
  if (!childId || !parentId || !coords?.lat || !coords?.lng) return;

  const loc = { ...payload, timestamp: Date.now() };

  // Historique court
  lastLocations.set(childId, loc);
  const arr = history.get(childId) || [];
  arr.push(loc);
  if (arr.length > MAX_HISTORY) arr.splice(0, arr.length - MAX_HISTORY);
  history.set(childId, arr);

  // Diffusion
  io.to(`parent:${parentId}`).emit("locationUpdate", loc);

  // Vérif zones
  Zone.find({ parentId, enabled: true }).then((zones) => {
    for (const z of zones) {
      const d = distanceMeters(coords, z.center);
      const isInside = d <= Number(z.radius);
      const key = `${z._id}:${childId}`;
      const prev = zoneState.get(key);

      if (!prev) {
        zoneState.set(key, { inside: isInside });
      } else if (prev.inside !== isInside) {
        zoneState.set(key, { inside: isInside });
        io.to(`parent:${parentId}`).emit("zoneAlert", {
          type: isInside ? "ENTER_ZONE" : "EXIT_ZONE",
          zoneId: z._id,
          zoneName: z.name,
          childId,
          coords,
          timestamp: Date.now(),
        });
      }
    }
  });
}

// =======================================================
// 🔹 ROUTES
// =======================================================

// Upload
app.post("/upload", upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ msg: "Aucun fichier reçu" });
  const fileUrl = `${process.env.API_URL || "https://api.kidshade.net"}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

// Auth / Parents
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password, photo } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "Champs manquants" });

    const exist = await Parent.findOne({ email });
    if (exist) return res.status(409).json({ message: "Email déjà utilisé" });

    const parent = await Parent.create({ name, email, password, photo });
    res.json({ parent });
  } catch (err) {
    console.error("Erreur /signup", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const parent = await Parent.findOne({ email, password });
    if (!parent)
      return res.status(401).json({ message: "Identifiants invalides" });
    res.json({ parentId: parent._id, parent });
  } catch (e) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Zones
app.get("/zones/:parentId", async (req, res) => {
  const zones = await Zone.find({ parentId: req.params.parentId });
  res.json(zones);
});

app.post("/zones", async (req, res) => {
  try {
    const zone = await Zone.create(req.body);
    res.json({ ok: true, zone });
  } catch (e) {
    console.error(e);
    res.status(500).json({ msg: "Erreur création zone" });
  }
});

app.put("/zones/:zoneId", async (req, res) => {
  try {
    const zone = await Zone.findByIdAndUpdate(req.params.zoneId, req.body, {
      new: true,
    });
    res.json({ ok: true, zone });
  } catch (e) {
    console.error(e);
    res.status(500).json({ msg: "Erreur mise à jour zone" });
  }
});

app.delete("/zones/:zoneId", async (req, res) => {
  try {
    await Zone.findByIdAndDelete(req.params.zoneId);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ msg: "Erreur suppression zone" });
  }
});

// Tracking
app.post("/tracking/update", (req, res) => {
  handleIncomingLocation(req.body, "HTTP");
  res.json({ msg: "Position enregistrée et diffusée ✅" });
});

app.get("/tracking/:parentId", (req, res) => {
  const out = [];
  lastLocations.forEach((v) => v.parentId === req.params.parentId && out.push(v));
  res.json(out);
});

// =======================================================
// 🔹 Lancement serveur
// =======================================================
server.listen(PORT, () => {
  console.log(`✅ Serveur KidShade démarré sur le port ${PORT}`);
});
