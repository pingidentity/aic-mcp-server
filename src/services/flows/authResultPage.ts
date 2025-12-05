// src/services/flows/authResultPage.ts

/**
 * Generate a branded HTML page for OAuth redirect callback
 * Matches the visual design of PingOne AIC login pages with auto-close functionality
 *
 * @param isSuccess - Whether authentication was successful
 * @param errorDetails - Optional error details (only shown on failure)
 * @returns Complete HTML page as string
 */
export function generateAuthResultPage(
  isSuccess: boolean,
  errorDetails?: string
): string {
  const currentYear = new Date().getFullYear();

  const heading = isSuccess ? 'Authorization Successful' : 'Authorization Failed';
  const message = isSuccess
    ? 'The PingOne AIC MCP Server can now access PingOne Advanced Identity Cloud APIs with your permissions.'
    : 'An error occurred during authentication.';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>PingOne AIC MCP Server - ${heading}</title>
  <link rel="icon" href="https://assets.pingone.com/ux/ui-library/5.0.2/images/logo-pingidentity.png" />
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">

  <style>
    :root {
      --font-color: #111827;
      --secondary-font-color: #6b7280;
      --page-background: #e8e9f0;
      --panel-background-color: #ffffff;
      --panel-border-color: #d9d8db;
      --error-bg: #fef2f2;
      --error-border: #fecaca;
      --error-text: #991b1b;
    }

    html,
    body {
      margin: 0;
    }

    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: "Open Sans", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--page-background);
    }

    .container {
      display: flex;
      flex-direction: column;
      width: 800px;
      min-height: 450px;
      margin: 2rem;
      padding: 32px;
      box-sizing: border-box;
      background: var(--panel-background-color);
      border: 1px solid var(--panel-border-color);
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06);
    }

    .content {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }

    .logo {
      height: 50px;
      margin-bottom: 50px;
    }

    h1 {
      margin: 0 0 20px 0;
      font-size: 28px;
      font-weight: 600;
      color: var(--font-color);
    }

    .secondary-text {
      font-size: 0.9375rem;
      font-weight: 400;
      color: var(--secondary-font-color);
    }

    p.subtitle {
      margin: 0;
      line-height: 1.6;
    }

    .error-details {
      margin-top: 20px;
      padding: 16px;
      background-color: var(--error-bg);
      border: 1px solid var(--error-border);
      border-radius: 8px;
      color: var(--error-text);
      max-width: 600px;
      word-wrap: break-word;
      text-align: left;
    }

    #closeMessage {
      margin-top: 24px;
    }

    footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 24px;
      text-align: center;
    }

    @media (max-width: 850px) {
      .container {
        width: 90%;
      }
    }
  </style>
</head>

<body>
  <div class="container" role="main">
    <div class="content">
      <img class="logo" src="https://cdn-docs.pingidentity.com/site-nav/ping-logo-horizontal.svg"
        alt="Ping Identity logo" />

      <h1>${heading}</h1>
      <p class="subtitle secondary-text">${message}</p>

      ${errorDetails ? `
      <div class="error-details secondary-text">
        <strong>Error:</strong> ${errorDetails}
      </div>
      ` : ''}

      <p class="subtitle secondary-text" id="closeMessage">${isSuccess ? '' : 'You can close this window.'}</p>
    </div>
  </div>
  <footer class="secondary-text">
    &copy; Copyright <span id="year">${currentYear}</span> Ping Identity. All rights reserved.
  </footer>
  <script>
    ${isSuccess ? `
    // Auto-close countdown for success
    (function() {
      var countdown = 3;
      var closeMessage = document.getElementById('closeMessage');

      // Update message immediately
      closeMessage.textContent = 'This window will close in ' + countdown + ' seconds...';

      // Start countdown
      var countdownInterval = setInterval(function() {
        countdown--;
        if (countdown > 0) {
          closeMessage.textContent = 'This window will close in ' + countdown + ' second' + (countdown !== 1 ? 's' : '') + '...';
        } else {
          clearInterval(countdownInterval);
          window.close();
          closeMessage.textContent = 'You can close this window now.';
        }
      }, 1000);
    })();
    ` : ''}
  </script>
</body>
</html>`;
}
