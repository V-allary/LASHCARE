require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   EMAIL SETUP
========================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendBookingEmail(booking) {
  const ownerMail = {
    from: `"La Lashes Website" <${process.env.EMAIL_USER}>`,
    to: process.env.OWNER_EMAIL,
    subject: booking.type === "academy"
      ? "🎓 New Academy Enrollment"
      : "💄 New Lash Booking",
    html: `
      <h3>New Booking</h3>
      <p><strong>Name:</strong> ${booking.name}</p>
      <p><strong>Phone:</strong> ${booking.phone}</p>
      <p><strong>Email:</strong> ${booking.email}</p>
      <p><strong>Service:</strong> ${booking.service}</p>
      <p><strong>Total:</strong> KES ${booking.total}</p>
      <p><strong>Deposit Paid:</strong> KES ${booking.deposit}</p>
      <p><strong>Balance:</strong> KES ${booking.total - booking.deposit}</p>
      <p>Status: <strong>${booking.status}</strong></p>
    `
  };

  await transporter.sendMail(ownerMail);
}

/* =========================
   PESAPAL TOKEN
========================= */
async function getPesapalToken() {
  const res = await axios.post(
    `${process.env.PESAPAL_BASE_URL}/api/Auth/RequestToken`,
    {
      consumer_key: process.env.PESAPAL_CONSUMER_KEY,
      consumer_secret: process.env.PESAPAL_CONSUMER_SECRET
    }
  );
  return res.data.token;
}

/* =========================
   CREATE PAYMENT
========================= */
app.post("/create-payment", async (req, res) => {
  const { amount, phone, description } = req.body;

  if (!amount || !phone) {
    return res.status(400).json({ error: "Missing payment details" });
  }

  try {
    const token = await getPesapalToken();

    const order = {
      id: `ORDER-${Date.now()}`,
      currency: "KES",
      amount,
      description,
      callback_url: process.env.CALLBACK_URL,
      notification_id: process.env.IPN_ID,
      billing_address: {
        phone_number: phone,
        country_code: "KE"
      }
    };

    const response = await axios.post(
      `${process.env.PESAPAL_BASE_URL}/api/Transactions/SubmitOrderRequest`,
      order,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({ redirect_url: response.data.redirect_url });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Payment initiation failed" });
  }
});

/* =========================
   IPN (PAYMENT CONFIRMATION)
========================= */
app.post("/ipn", async (req, res) => {
  const { status, booking } = req.body;

  if (status === "COMPLETED" && booking) {
    await sendBookingEmail({
      ...booking,
      status: "PAID"
    });
  }

  res.sendStatus(200);
});

/* =========================
   SERVER START
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});