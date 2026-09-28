// *************** IMPORT LIBRARY ***************
const nodemailer = require('nodemailer');

// *************** IMPORT MODULE ***************
const applicationConfig = require('../../core/config');

// *************** GLOBAL VARIABLES ***************

/**
 * SMTP transporter used by generic email dispatch.
 */
const emailTransporter = nodemailer.createTransport({
  host: applicationConfig.smtp.host,
  port: applicationConfig.smtp.port,
  auth: {
    user: applicationConfig.smtp.user,
    pass: applicationConfig.smtp.pass,
  },
});

// *************** SERVICE FUNCTION ***************

/**
 * Sends a generic HTML email through the configured SMTP transport.
 *
 * @param {string} to - Recipient email address.
 * @param {string} subject - Email subject line.
 * @param {string} htmlBody - HTML body content.
 * @returns {Promise<Object>} Nodemailer delivery result.
 */
async function SendEmail(to, subject, htmlBody) {
  return emailTransporter.sendMail({
    from: applicationConfig.smtp.user,
    to,
    subject,
    html: htmlBody,
  });
}

// *************** EXPORT MODULE ***************
module.exports = {
  SendEmail,
};
