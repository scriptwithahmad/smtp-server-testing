import express from "express";
import { promises as dns } from "dns";
import emailExistence from "email-existence";

const router = express.Router();

// Test API endpoint
router.get("/", (req, res) => {
  res.status(200).send({ message: "Server Running Properly!" });
});

/**
 * Function to check MX records
 */
const checkMXRecords = async (domain) => {
  try {
    const addresses = await dns.resolveMx(domain);
    if (!addresses || addresses.length === 0) {
      return { status: false, message: "No MX records found" };
    }

    const mxRecordsWithIPs = await Promise.all(
      addresses.map(async (record) => {
        try {
          const ips = await dns.resolve(record.exchange);
          return { exchange: record.exchange, priority: record.priority, ips };
        } catch (err) {
          console.error(
            `Error resolving IP for ${record.exchange}:`,
            err.message
          );
          return {
            exchange: record.exchange,
            priority: record.priority,
            ips: [],
          };
        }
      })
    );

    return { status: true, records: mxRecordsWithIPs };
  } catch (err) {
    console.error("Error checking MX records:", err.message);
    return { status: false, message: "Error checking MX records" };
  }
};

/**
 * Function to check DMARC records
 */
const checkDMARCRecords = async (domain) => {
  try {
    const records = await dns.resolveTxt(`_dmarc.${domain}`);
    if (!records || records.length === 0) {
      return { status: false, message: "No DMARC records found" };
    }
    const dmarcRecord = records.flat().join("");
    return { status: true, record: dmarcRecord };
  } catch (err) {
    console.error("Error checking DMARC records:", err.message);
    return { status: false, message: "Error checking DMARC records" };
  }
};

/**
 * Function to check SPF records
 */
const checkSPFRecords = async (domain) => {
  try {
    const records = await dns.resolveTxt(domain);
    if (!records || records.length === 0) {
      return { status: false, message: "No SPF records found" };
    }
    const spfRecord = records
      .flat()
      .find((record) => record.includes("v=spf1"));
    if (spfRecord) {
      return { status: true, record: spfRecord };
    } else {
      return { status: false, message: "No SPF records found" };
    }
  } catch (err) {
    console.error("Error checking SPF records:", err.message);
    return { status: false, message: "Error checking SPF records" };
  }
};

/**
 * Function to check SMTP mailbox existence
 */
const checkSMTPMailbox = async (email) => {
  return new Promise((resolve) => {
    emailExistence.check(email, (error, response) => {
      if (error) {
        console.error(`Error verifying mailbox for ${email}:`, error.message);
        return resolve({
          status: false,
          message: "Error verifying mailbox",
        });
      }
      resolve({
        status: response,
        message: response ? "Mailbox exists" : "Mailbox does not exist",
      });
    });
  });
};

// POST => API to verify email
router.post("/check-email", async (req, res) => {
  const { emails } = req.body;

  // Validate input
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid input. Provide an array of emails.",
    });
  }

  try {
    const results = await Promise.all(
      emails.map(async (emailAddress) => {
        if (!emailAddress.includes("@")) {
          return {
            email: emailAddress,
            smtp: { status: false, message: "Invalid email format" },
            dmarc: { status: false, message: "Invalid email format" },
            spf: { status: false, message: "Invalid email format" },
            mx: { status: false, message: "Invalid email format" },
          };
        }

        const domain = emailAddress.split("@")[1];
        const dmarcStatus = await checkDMARCRecords(domain);
        const spfStatus = await checkSPFRecords(domain);
        const mxStatus = await checkMXRecords(domain);
        const smtpStatus = await checkSMTPMailbox(emailAddress);

        return {
          email: emailAddress,
          dmarc: dmarcStatus,
          spf: spfStatus,
          mx: mxStatus,
          smtp: smtpStatus,
        };
      })
    );

    res.json({
      success: true,
      results,
      summary: {
        totalEmails: emails.length,
        validEmails: results.filter((result) => result.smtp.status).length,
      },
    });
  } catch (err) {
    console.error("Error verifying emails:", err.message);
    res.status(500).json({
      success: false,
      message: "Error verifying emails",
      error: err.message,
    });
  }
});

export default router;
