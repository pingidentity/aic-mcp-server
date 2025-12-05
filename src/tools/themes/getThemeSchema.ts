import { createToolResponse } from '../../utils/apiHelpers.js';

const SCOPES: string[] = [];

/**
 * Comprehensive theme schema documentation for PingOne AIC
 * Returns the structure and requirements for theme objects
 */
export const getThemeSchemaTool = {
  name: 'getThemeSchema',
  title: 'Get Theme Schema',
  description: 'Get comprehensive schema documentation for PingOne AIC themes including the expected payload structure, field types, enum values, and constraints. Use this before creating or updating themes to understand requirements.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true
  },
  inputSchema: {},
  async toolFunction() {
    const schema = {
      schemaVersion: '1.0',
      description: 'PingOne Advanced Identity Cloud theme configuration schema. A theme object contains styling and configuration for authentication journeys and account pages.',

      themeStructure: {
        description: 'Complete theme object structure with all available fields',
        requiredFields: ['name'],
        systemControlledFields: {
          _id: 'Auto-generated UUID (do not provide on create)',
          isDefault: 'Controlled via setDefaultTheme tool (always false on create)'
        },

        example: {
          minimal: {
            description: 'Minimum required fields to create a theme',
            payload: {
              name: 'My Custom Theme'
            }
          },
          typical: {
            description: 'Common theme with brand colors and journey customization',
            payload: {
              name: 'My Brand Theme',
              primaryColor: '#0066cc',
              primaryOffColor: '#0052a3',
              logo: 'https://example.com/logo.svg',
              logoHeight: '50',
              journeyLayout: 'card',
              backgroundColor: '#f5f5f5'
            }
          }
        }
      },

      fields: {
        _id: {
          type: 'string',
          required: false,
          description: 'Unique theme identifier',
          systemGenerated: true,
          immutable: true,
          note: 'Auto-generated UUID. Do not provide on create.'
        },

        name: {
          type: 'string',
          required: true,
          description: 'Theme display name',
          constraints: 'Must be unique within the realm',
          example: 'Corporate Brand Theme'
        },

        linkedTrees: {
          type: 'array',
          required: false,
          description: 'Authentication trees using this theme',
          default: [],
          example: []
        },

        isDefault: {
          type: 'boolean',
          required: false,
          description: 'Whether this is the default theme for the realm',
          systemControlled: true,
          default: false,
          note: 'Always false on create. Use setDefaultTheme tool to change.'
        },

        // Global Styles - Brand Colors
        primaryColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Primary brand color for buttons, checkboxes, and switches',
          default: '#324054',
          example: '#0066cc'
        },

        primaryOffColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Brand hover color',
          default: '#242E3C',
          example: '#0052a3'
        },

        buttonFocusBorderColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Color for focus indication on buttons and links',
          default: '#0672cb'
        },

        secondaryColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Color for muted text',
          default: '#69788b'
        },

        successColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Color for success actions and messages',
          default: '#2ed47a'
        },

        dangerColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Color for high-level alerts and errors',
          default: '#f7685b'
        },

        warningColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Color for warning messages',
          default: '#ffb946'
        },

        infoColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Color for informational messages',
          default: '#109cf1'
        },

        lightColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Light color for text on dark backgrounds',
          default: '#f6f8fa'
        },

        darkColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Dark color for text or backgrounds',
          default: '#23282e'
        },

        // Global Styles - Typography
        fontFamily: {
          type: 'string',
          required: false,
          description: 'Font family for all text. Use standard fonts (Arial, Helvetica) or Google Font names (Open Sans, Roboto, etc.)',
          default: 'Open Sans',
          examples: ['Open Sans', 'Roboto', 'Arial', 'Helvetica', 'PT Sans', 'Noto Sans']
        },

        // Global Styles - Buttons
        textColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Button text color',
          default: '#ffffff'
        },

        buttonRounded: {
          type: 'string',
          required: false,
          format: 'pixels (0-100)',
          description: 'Button border radius in pixels',
          default: '5',
          examples: ['0', '5', '25', '50']
        },

        // Global Styles - Links
        linkColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Link color',
          default: '#109cf1'
        },

        linkActiveColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Link hover/active color',
          default: '#0c85cf'
        },

        linkColorOnDark: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Link color when on dark background',
          default: '#109cf1'
        },

        linkActiveColorOnDark: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Link hover color when on dark background',
          default: '#0a6eab'
        },

        boldLinks: {
          type: 'boolean',
          required: false,
          description: 'Make links bold',
          default: false
        },

        // Global Styles - Switches
        switchBackgroundColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Toggle switch background color',
          default: '#939393'
        },

        // Global Settings - Favicon
        favicon: {
          type: 'string',
          required: false,
          format: 'URL, base64 data URI, or localized object',
          description: 'Favicon for all journey and account pages. Supports hosted URLs or base64 data URIs.',
          localizable: true,
          default: '',
          examples: [
            'https://example.com/favicon.ico',
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...'
          ]
        },

        // Journey Pages - Page Background
        backgroundColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Journey page background color',
          default: '#324054'
        },

        backgroundImage: {
          type: 'string',
          required: false,
          format: 'URL or base64 data URI',
          description: 'Optional background image for journey pages. Supports hosted URLs or base64 data URIs.',
          default: '',
          examples: [
            'https://example.com/background.jpg',
            'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA...'
          ]
        },

        // Journey Pages - Sign-in Card
        journeyCardBackgroundColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Sign-in card background color',
          default: '#ffffff'
        },

        journeyCardHeaderBackgroundColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Sign-in card header background color',
          default: '#ffffff'
        },

        journeyCardTitleColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Page title text color',
          default: '#23282e'
        },

        journeyCardTextColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Body text color across journey pages',
          default: '#5e6d82'
        },

        journeyInputBackgroundColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Input field background color',
          default: '#ffffff'
        },

        journeyInputBorderColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Input field border color',
          default: '#c0c9d5'
        },

        journeyInputFocusBorderColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Input field focus border color. Defaults to primaryColor if not set.',
          default: '#324054'
        },

        journeyInputSelectColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Dropdown/select active item color',
          default: '#e4f4fd'
        },

        journeyInputSelectHoverColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Dropdown/select hover item color',
          default: '#f6f8fa'
        },

        journeyInputTextColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Input field text color',
          default: '#23282e'
        },

        journeyInputLabelColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Input field label color',
          default: '#5e6d82'
        },

        journeyCardShadow: {
          type: 'number',
          required: false,
          format: 'pixels (0-25)',
          description: 'Card shadow size in pixels',
          default: 3,
          examples: [0, 3, 10, 25]
        },

        journeyCardBorderRadius: {
          type: 'number',
          required: false,
          format: 'pixels (0-100)',
          description: 'Card border radius in pixels',
          default: 4,
          examples: [0, 4, 10, 20]
        },

        journeyFloatingLabels: {
          type: 'boolean',
          required: false,
          description: 'Use floating labels for input fields',
          default: true
        },

        journeyShowAsteriskForRequiredFields: {
          type: 'boolean',
          required: false,
          description: 'Show asterisk (*) next to required field labels',
          default: false
        },

        // Journey Pages - Logo
        logoEnabled: {
          type: 'boolean',
          required: false,
          description: 'Enable/disable logo display on journey pages',
          default: true
        },

        logo: {
          type: 'string',
          required: false,
          format: 'URL, base64 data URI, or localized object',
          description: 'Logo for journey pages (png, jpg, or svg). Supports hosted URLs or base64 data URIs.',
          localizable: true,
          default: '',
          examples: [
            'https://example.com/logo.svg',
            'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg=='
          ]
        },

        logoAltText: {
          type: 'string',
          required: false,
          format: 'string or localized object',
          description: 'Logo alt text for accessibility',
          localizable: true,
          default: ''
        },

        logoHeight: {
          type: 'string',
          required: false,
          format: 'pixels (40-100)',
          description: 'Logo height in pixels',
          default: '40',
          examples: ['40', '50', '72', '100']
        },

        // Journey Pages - Layout
        journeyLayout: {
          type: 'string',
          required: false,
          enum: ['card', 'justified-left', 'justified-right'],
          description: 'Layout style for authentication journeys',
          enumDescriptions: {
            card: 'Centered card layout',
            'justified-left': 'Content aligned to left with optional right panel',
            'justified-right': 'Content aligned to right with optional left panel'
          },
          default: 'card',
          example: 'card'
        },

        journeySignInButtonPosition: {
          type: 'string',
          required: false,
          enum: ['flex-column', 'justify-content-center', 'justify-content-start', 'justify-content-end'],
          description: 'Sign-in button positioning',
          enumDescriptions: {
            'flex-column': 'Full-width button',
            'justify-content-center': 'Centered button',
            'justify-content-start': 'Left-aligned button',
            'justify-content-end': 'Right-aligned button'
          },
          default: 'flex-column',
          example: 'flex-column'
        },

        journeyJustifiedContentEnabled: {
          type: 'boolean',
          required: false,
          description: 'Enable custom content panel (only applies when layout is justified-left or justified-right)',
          default: false
        },

        journeyJustifiedContent: {
          type: 'string',
          required: false,
          format: 'HTML string or localized object',
          description: 'HTML/CSS content for justified panel. Supports Bootstrap 4 classes and inline styles only. External CSS/fonts will not load.',
          htmlSupport: true,
          localizable: true,
          default: '',
          example: '<div class="d-flex align-items-center"><h1>Welcome</h1></div>'
        },

        journeyJustifiedContentMobileViewEnabled: {
          type: 'boolean',
          required: false,
          description: 'Show justified content on mobile devices',
          default: false
        },

        journeyTheaterMode: {
          type: 'boolean',
          required: false,
          description: 'Expand UI to use full browser window (only applies when layout is not card)',
          default: false
        },

        // Journey Pages - Header
        journeyHeaderEnabled: {
          type: 'boolean',
          required: false,
          description: 'Show header above sign-in card',
          default: false
        },

        journeyHeader: {
          type: 'string',
          required: false,
          format: 'HTML string or localized object',
          description: 'HTML/CSS content for header. Supports Bootstrap 4 classes and inline styles only. External CSS/fonts will not load.',
          htmlSupport: true,
          localizable: true,
          default: '<div class="d-flex justify-content-center py-4 flex-grow-1">Header Content</div>',
          example: '<nav class="navbar"><a class="navbar-brand" href="#">My Brand</a></nav>'
        },

        journeyHeaderSkipLinkEnabled: {
          type: 'boolean',
          required: false,
          description: 'Add accessibility skip link in header',
          default: false
        },

        journeyFocusElement: {
          type: 'string',
          required: false,
          enum: ['header', 'headerFirstStep', 'content'],
          description: 'Keyboard focus behavior',
          enumDescriptions: {
            header: 'Always focus on header',
            headerFirstStep: 'Focus on header for first step, content for subsequent steps',
            content: 'Always focus on card content'
          },
          default: 'header',
          example: 'header'
        },

        // Journey Pages - Footer
        journeyFooterEnabled: {
          type: 'boolean',
          required: false,
          description: 'Show footer below sign-in card',
          default: false
        },

        journeyFooter: {
          type: 'string',
          required: false,
          format: 'HTML string or localized object',
          description: 'HTML/CSS content for footer. Supports Bootstrap 4 classes and inline styles only. External CSS/fonts will not load.',
          htmlSupport: true,
          localizable: true,
          default: '<div class="d-flex justify-content-center py-4 w-100"><span>© 2021 My Company</span></div>',
          example: '<footer class="text-center py-4"><p>© 2024 Example Corp</p></footer>'
        },

        // Journey Pages - Accessibility
        journeyA11yAddFallbackErrorHeading: {
          type: 'boolean',
          required: false,
          description: 'Add fallback error heading for accessibility',
          default: true
        },

        // Journey Pages - Remember Me
        journeyRememberMeEnabled: {
          type: 'boolean',
          required: false,
          description: 'Show "Remember me" checkbox option',
          default: false
        },

        journeyRememberMeLabel: {
          type: 'string',
          required: false,
          description: 'Custom label for remember me checkbox',
          default: ''
        },

        // Account Pages - Navigation
        accountNavigationBackgroundColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account page navigation background color',
          default: '#ffffff'
        },

        accountNavigationTextColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account page navigation text color',
          default: '#455469'
        },

        profileMenuHighlightColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account navigation active item background',
          default: '#f3f5f8'
        },

        profileMenuTextHighlightColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account navigation active item text color',
          default: '#455469'
        },

        profileMenuHoverColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account navigation hover background',
          default: '#f3f5f8'
        },

        profileMenuHoverTextColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account navigation hover text color',
          default: '#455469'
        },

        accountNavigationToggleBorderColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account navigation toggle border',
          default: '#e7eef4'
        },

        // Account Pages - Top Bar
        topBarBackgroundColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account page top bar background',
          default: '#ffffff'
        },

        topBarBorderColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account page top bar border color',
          default: '#e7eef4'
        },

        topBarHeaderColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account page top bar header text color',
          default: '#23282e'
        },

        topBarTextColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account page top bar text color',
          default: '#69788b'
        },

        // Account Pages - Page Styles
        profileBackgroundColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account page background color',
          default: '#f6f8fa'
        },

        pageTitle: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account page title color',
          default: '#23282e'
        },

        bodyText: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account page body text color',
          default: '#23282e'
        },

        // Account Pages - Cards (condensed - 14 more card color fields with similar structure)
        accountCardBackgroundColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account page card background',
          default: '#ffffff'
        },

        accountCardOuterBorderColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account card outer border color',
          default: '#e7eef4'
        },

        accountCardInnerBorderColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account card inner border color',
          default: '#e7eef4'
        },

        accountCardHeaderColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account card header text color',
          default: '#23282e'
        },

        accountCardTextColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account card body text color',
          default: '#5e6d82'
        },

        accountCardTabActiveColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account card active tab background',
          default: '#e4f4fd'
        },

        accountCardTabActiveBorderColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account card active tab border color',
          default: '#109cf1'
        },

        accountTableRowHoverColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account table row hover color',
          default: '#f6f8fa'
        },

        accountCardInputBackgroundColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account card input background',
          default: '#ffffff'
        },

        accountCardInputBorderColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account card input border color',
          default: '#c0c9d5'
        },

        accountCardInputFocusBorderColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account card input focus border. Defaults to primaryColor if not set.',
          default: '#324054'
        },

        accountCardInputSelectColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account card select active color',
          default: '#edf7fd'
        },

        accountCardInputSelectHoverColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account card select hover color',
          default: '#f6f8fa'
        },

        accountCardInputTextColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account card input text color',
          default: '#23282e'
        },

        accountCardInputLabelColor: {
          type: 'string',
          required: false,
          format: 'hex color (#RRGGBB)',
          description: 'Account card input label color',
          default: '#5e6d82'
        },

        accountCardShadow: {
          type: 'number',
          required: false,
          format: 'pixels (0-25)',
          description: 'Account card shadow size in pixels',
          default: 3,
          examples: [0, 3, 10, 25]
        },

        // Account Pages - Logo
        logoProfile: {
          type: 'string',
          required: false,
          format: 'URL, base64 data URI, or localized object',
          description: 'Account page expanded logo (when navigation is expanded). Supports hosted URLs or base64 data URIs.',
          localizable: true,
          default: '',
          examples: [
            'https://example.com/logo-full.svg',
            'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg=='
          ]
        },

        logoProfileAltText: {
          type: 'string',
          required: false,
          format: 'string or localized object',
          description: 'Alt text for expanded logo',
          localizable: true,
          default: ''
        },

        logoProfileCollapsed: {
          type: 'string',
          required: false,
          format: 'URL, base64 data URI, or localized object',
          description: 'Account page collapsed logo (when navigation is collapsed). Supports hosted URLs or base64 data URIs.',
          localizable: true,
          default: '',
          examples: [
            'https://example.com/logo-icon.svg',
            'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg=='
          ]
        },

        logoProfileCollapsedAltText: {
          type: 'string',
          required: false,
          format: 'string or localized object',
          description: 'Alt text for collapsed logo',
          localizable: true,
          default: ''
        },

        logoProfileHeight: {
          type: 'string',
          required: false,
          format: 'pixels (20-40)',
          description: 'Expanded logo height in pixels',
          default: '24',
          examples: ['20', '24', '28', '40']
        },

        logoProfileCollapsedHeight: {
          type: 'string',
          required: false,
          format: 'pixels (20-40)',
          description: 'Collapsed logo height in pixels',
          default: '24',
          examples: ['20', '24', '28', '40']
        },

        // Account Pages - Footer
        accountFooterEnabled: {
          type: 'boolean',
          required: false,
          description: 'Show footer on account pages',
          default: false
        },

        accountFooter: {
          type: 'string',
          required: false,
          format: 'HTML string or localized object',
          description: 'HTML/CSS content for account footer. Supports Bootstrap 4 classes and inline styles only. External CSS/fonts will not load.',
          htmlSupport: true,
          localizable: true,
          default: '<div class="d-flex justify-content-center py-4 w-100"><span>© 2021 My Company</span></div>',
          example: '<footer class="text-center py-4"><p>© 2024 Example Corp</p></footer>'
        },

        // Account Pages - Profile Page Sections
        accountPageSections: {
          type: 'object',
          required: false,
          description: 'Configure which sections appear on the user profile page',
          structure: {
            personalInformation: { enabled: 'boolean (default: true)' },
            accountSecurity: {
              enabled: 'boolean (default: true)',
              subsections: {
                username: 'boolean (default: true, always enabled)',
                password: 'boolean (default: true)',
                twoStepVerification: 'boolean (default: true)',
                securityQuestions: 'boolean (default: false)'
              }
            },
            social: { enabled: 'boolean (default: false)' },
            trustedDevices: { enabled: 'boolean (default: true)' },
            oauthApplications: { enabled: 'boolean (default: false)' },
            preferences: { enabled: 'boolean (default: false)' },
            consent: { enabled: 'boolean (default: false)' },
            accountControls: { enabled: 'boolean (default: false)' }
          },
          default: {
            personalInformation: { enabled: true },
            accountSecurity: { enabled: true, subsections: { username: { enabled: true }, password: { enabled: true }, twoStepVerification: { enabled: true }, securityQuestions: { enabled: false } } },
            social: { enabled: false },
            trustedDevices: { enabled: true },
            oauthApplications: { enabled: false },
            preferences: { enabled: false },
            consent: { enabled: false },
            accountControls: { enabled: false }
          }
        }
      },

      importantNotes: {
        htmlCssFields: {
          description: 'HTML content fields support Bootstrap 4 classes and inline CSS only',
          fields: ['journeyHeader', 'journeyFooter', 'journeyJustifiedContent', 'accountFooter'],
          supported: ['Bootstrap 4 CSS classes', 'Inline CSS (style attribute)', 'SVG elements', 'Data URIs for images'],
          notSupported: ['External CSS files (<link>)', 'External fonts (@import, <link>)', 'JavaScript', '<script> tags'],
          example: '<div class="d-flex justify-content-center" style="background: #f5f5f5; padding: 20px;"><h1>Welcome</h1></div>'
        },

        localization: {
          description: 'Many fields support localization via object format with locale keys',
          format: '{ "en": "English value", "fr": "French value", "de": "German value" }',
          fields: ['favicon', 'logo', 'logoAltText', 'logoProfile', 'logoProfileAltText', 'logoProfileCollapsed', 'logoProfileCollapsedAltText', 'journeyHeader', 'journeyFooter', 'journeyJustifiedContent', 'accountFooter'],
          example: { en: 'Welcome', fr: 'Bienvenue', de: 'Willkommen' }
        },

        colorFormat: {
          description: 'All color fields must use hexadecimal format',
          format: '#RRGGBB',
          valid: ['#ffffff', '#000000', '#0066cc', '#f5f5f5'],
          invalid: ['white', 'rgb(255,255,255)', '#fff', '#ffffffff']
        },

        imageFields: {
          description: 'Image fields support both hosted URLs and base64 data URIs',
          fields: ['favicon', 'logo', 'logoProfile', 'logoProfileCollapsed', 'backgroundImage'],
          formats: {
            hostedUrl: 'Standard HTTPS URL to an image file',
            dataUri: 'Base64-encoded data URI for inline images'
          },
          supportedFormats: ['PNG', 'JPG/JPEG', 'SVG', 'ICO (favicon only)'],
          examples: {
            hostedUrl: 'https://example.com/logo.svg',
            dataUriPng: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...',
            dataUriJpeg: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA...',
            dataUriSvg: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg=='
          },
          notes: [
            'Base64 data URIs allow embedding images directly in the theme without external hosting',
            'Data URIs can be very long - consider using hosted URLs for large images',
            'SVG format is recommended for logos due to scalability and small file size'
          ]
        },

        enumFields: {
          journeyLayout: ['card', 'justified-left', 'justified-right'],
          journeySignInButtonPosition: ['flex-column', 'justify-content-center', 'justify-content-start', 'justify-content-end'],
          journeyFocusElement: ['header', 'headerFirstStep', 'content']
        },

        autoCalculatedFields: {
          description: 'These fields auto-default to other values if not provided',
          fields: {
            journeyInputFocusBorderColor: 'Defaults to primaryColor',
            accountCardInputFocusBorderColor: 'Defaults to primaryColor'
          }
        },

        systemControlledFields: {
          description: 'These fields are managed by the system',
          fields: {
            _id: 'Auto-generated UUID on create (immutable)',
            isDefault: 'Always false on create. Use setDefaultTheme tool to change.'
          }
        }
      },

      recommendedWorkflow: [
        '1. Call getRealmThemes to see existing themes',
        '2. Call getTheme on an existing theme to see a real example (If present, Robroy is a good default theme to reference)',
        '3. Review this schema to understand available fields and requirements',
        '4. Create a new theme using createTheme with desired customizations',
        '5. Use setDefaultTheme to make it the realm default'
      ]
    };

    return createToolResponse(JSON.stringify(schema, null, 2));
  }
};
