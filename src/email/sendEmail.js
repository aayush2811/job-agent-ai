const nodemailer = require("nodemailer");
const { sendErrorAlert } = require("../utils/errorNotifier");

const sendJobApplicationEmail = async (job) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",

      auth: {
        user: process.env.EMAIL_USER,

        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,

      to: job.email,

      subject: `Application for ${job.role}`,

      html: `
      <p>Dear Hiring Team,</p>
      
      <p>
      I hope you are doing well.
      </p>
      
      <p>
      I am interested in applying for the
      <b>${job.role}</b> position at
      <b>${job.company}</b>.
      </p>
      
      <p>
      I have hands-on experience with Node.js,
      React.js, MongoDB, Next.js, AWS,
      and backend development.
      </p>
      
      <p>
      Please find my resume attached for your consideration.
      </p>
      
      <p>
      Thank you for your time.
      </p>
      
      <p>
      Best Regards,<br/>
      Aayush Bhatt<br/>
      8780347711
      </p>
      `,

      attachments: [
        {
          filename: "Aayush_Bhatt_Resume.pdf",

          path: "./resume/Aayush_Bhatt_Resume.pdf",
        },
      ],
    };

    await transporter.sendMail(mailOptions);

    console.log("📧 Email Sent Successfully");
  } catch (error) {
    console.error("[Email] send failed:", error?.message || error);
    await sendErrorAlert("Email Sending Failed", error);
    throw error;
  }
};

module.exports = sendJobApplicationEmail;
