/**
 * Default theme configuration based on the AIC Starter Theme
 * These defaults will be used when creating a new theme if fields are not provided
 */

export interface ThemeConfiguration {
  _id: string;
  name: string;
  linkedTrees: any[];
  isDefault: boolean;

  // Global Styles - Brand Colors
  primaryColor: string;
  primaryOffColor: string;
  buttonFocusBorderColor: string;
  secondaryColor: string;
  successColor: string;
  dangerColor: string;
  warningColor: string;
  infoColor: string;
  lightColor: string;
  darkColor: string;

  // Global Styles - Typography
  fontFamily: string;

  // Global Styles - Buttons
  textColor: string;
  buttonRounded: string;

  // Global Styles - Links
  linkColor: string;
  linkActiveColor: string;
  linkColorOnDark: string;
  linkActiveColorOnDark: string;
  boldLinks: boolean;

  // Global Styles - Switches
  switchBackgroundColor: string;

  // Global Settings - Favicon
  favicon: string;

  // Journey Pages - Page Background
  backgroundColor: string;
  backgroundImage: string;

  // Journey Pages - Sign-in Card
  journeyCardBackgroundColor: string;
  journeyCardHeaderBackgroundColor: string;
  journeyCardTitleColor: string;
  journeyCardTextColor: string;
  journeyInputBackgroundColor: string;
  journeyInputBorderColor: string;
  journeyInputFocusBorderColor: string;
  journeyInputSelectColor: string;
  journeyInputSelectHoverColor: string;
  journeyInputTextColor: string;
  journeyInputLabelColor: string;
  journeyCardShadow: number;
  journeyCardBorderRadius: number;
  journeyFloatingLabels: boolean;
  journeyShowAsteriskForRequiredFields: boolean;

  // Journey Pages - Logo
  logoEnabled?: boolean;
  logo: string;
  logoAltText: string;
  logoHeight: string;

  // Journey Pages - Layout
  journeyLayout: 'card' | 'justified-left' | 'justified-right';
  journeySignInButtonPosition: 'flex-column' | 'justify-content-center' | 'justify-content-start' | 'justify-content-end';
  journeyJustifiedContentEnabled: boolean;
  journeyJustifiedContent: string;
  journeyJustifiedContentMobileViewEnabled: boolean;
  journeyTheaterMode: boolean;

  // Journey Pages - Header
  journeyHeaderEnabled: boolean;
  journeyHeader: string;
  journeyHeaderSkipLinkEnabled: boolean;
  journeyFocusElement: 'header' | 'headerFirstStep' | 'content';

  // Journey Pages - Footer
  journeyFooterEnabled: boolean;
  journeyFooter: string;

  // Journey Pages - Accessibility
  journeyA11yAddFallbackErrorHeading: boolean;

  // Journey Pages - Remember Me
  journeyRememberMeEnabled: boolean;
  journeyRememberMeLabel: string;

  // Account Pages - Navigation
  accountNavigationBackgroundColor: string;
  accountNavigationTextColor: string;
  profileMenuHighlightColor: string;
  profileMenuTextHighlightColor: string;
  profileMenuHoverColor: string;
  profileMenuHoverTextColor: string;
  accountNavigationToggleBorderColor: string;

  // Account Pages - Top Bar
  topBarBackgroundColor: string;
  topBarBorderColor: string;
  topBarHeaderColor: string;
  topBarTextColor: string;

  // Account Pages - Page Styles
  profileBackgroundColor: string;
  pageTitle: string;
  bodyText: string;

  // Account Pages - Cards
  accountCardBackgroundColor: string;
  accountCardOuterBorderColor: string;
  accountCardInnerBorderColor: string;
  accountCardHeaderColor: string;
  accountCardTextColor: string;
  accountCardTabActiveColor: string;
  accountCardTabActiveBorderColor: string;
  accountTableRowHoverColor: string;
  accountCardInputBackgroundColor: string;
  accountCardInputBorderColor: string;
  accountCardInputFocusBorderColor: string;
  accountCardInputSelectColor: string;
  accountCardInputSelectHoverColor: string;
  accountCardInputTextColor: string;
  accountCardInputLabelColor: string;
  accountCardShadow: number;

  // Account Pages - Logo
  logoProfile: string;
  logoProfileAltText: string;
  logoProfileCollapsed: string;
  logoProfileCollapsedAltText: string;
  logoProfileHeight: string;
  logoProfileCollapsedHeight: string;

  // Account Pages - Footer
  accountFooterEnabled: boolean;
  accountFooter: string;

  // Account Pages - Profile Page Sections
  accountPageSections: {
    accountControls: { enabled: boolean };
    accountSecurity: {
      enabled: boolean;
      subsections: {
        password: { enabled: boolean };
        securityQuestions: { enabled: boolean };
        twoStepVerification: { enabled: boolean };
        username: { enabled: boolean };
      };
    };
    consent: { enabled: boolean };
    oauthApplications: { enabled: boolean };
    personalInformation: { enabled: boolean };
    preferences: { enabled: boolean };
    social: { enabled: boolean };
    trustedDevices: { enabled: boolean };
  };
}

export const DEFAULT_THEME: Omit<ThemeConfiguration, '_id' | 'name' | 'isDefault'> = {
  linkedTrees: [],

  // Global Styles - Brand Colors
  primaryColor: '#324054',
  primaryOffColor: '#242E3C',
  buttonFocusBorderColor: '#0672cb',
  secondaryColor: '#69788b',
  successColor: '#2ed47a',
  dangerColor: '#f7685b',
  warningColor: '#ffb946',
  infoColor: '#109cf1',
  lightColor: '#f6f8fa',
  darkColor: '#23282e',

  // Global Styles - Typography
  fontFamily: 'Open Sans',

  // Global Styles - Buttons
  textColor: '#ffffff',
  buttonRounded: '5',

  // Global Styles - Links
  linkColor: '#109cf1',
  linkActiveColor: '#0c85cf',
  linkColorOnDark: '#109cf1',
  linkActiveColorOnDark: '#0a6eab',
  boldLinks: false,

  // Global Styles - Switches
  switchBackgroundColor: '#939393',

  // Global Settings - Favicon
  favicon: '',

  // Journey Pages - Page Background
  backgroundColor: '#324054',
  backgroundImage: '',

  // Journey Pages - Sign-in Card
  journeyCardBackgroundColor: '#ffffff',
  journeyCardHeaderBackgroundColor: '#ffffff',
  journeyCardTitleColor: '#23282e',
  journeyCardTextColor: '#5e6d82',
  journeyInputBackgroundColor: '#ffffff',
  journeyInputBorderColor: '#c0c9d5',
  journeyInputFocusBorderColor: '#324054',
  journeyInputSelectColor: '#e4f4fd',
  journeyInputSelectHoverColor: '#f6f8fa',
  journeyInputTextColor: '#23282e',
  journeyInputLabelColor: '#5e6d82',
  journeyCardShadow: 3,
  journeyCardBorderRadius: 4,
  journeyFloatingLabels: true,
  journeyShowAsteriskForRequiredFields: false,

  // Journey Pages - Logo
  logoEnabled: true,
  logo: '',
  logoAltText: '',
  logoHeight: '40',

  // Journey Pages - Layout
  journeyLayout: 'card',
  journeySignInButtonPosition: 'flex-column',
  journeyJustifiedContentEnabled: false,
  journeyJustifiedContent: '',
  journeyJustifiedContentMobileViewEnabled: false,
  journeyTheaterMode: false,

  // Journey Pages - Header
  journeyHeaderEnabled: false,
  journeyHeader: '<div class="d-flex justify-content-center py-4 flex-grow-1">Header Content</div>',
  journeyHeaderSkipLinkEnabled: false,
  journeyFocusElement: 'header',

  // Journey Pages - Footer
  journeyFooterEnabled: false,
  journeyFooter: '<div class="d-flex justify-content-center py-4 w-100"><span class="pr-1">© 2021</span>\n<a href="#" target="_blank" class="text-body">My Company, Inc</a><a href="#" target="_blank" style="color: #0000ee" class="pl-3 text-body">Privacy Policy</a><a href="#" target="_blank" style="color: #0000ee" class="pl-3 text-body">Terms & Conditions</a></div>',

  // Journey Pages - Accessibility
  journeyA11yAddFallbackErrorHeading: true,

  // Journey Pages - Remember Me
  journeyRememberMeEnabled: false,
  journeyRememberMeLabel: '',

  // Account Pages - Navigation
  accountNavigationBackgroundColor: '#ffffff',
  accountNavigationTextColor: '#455469',
  profileMenuHighlightColor: '#f3f5f8',
  profileMenuTextHighlightColor: '#455469',
  profileMenuHoverColor: '#f3f5f8',
  profileMenuHoverTextColor: '#455469',
  accountNavigationToggleBorderColor: '#e7eef4',

  // Account Pages - Top Bar
  topBarBackgroundColor: '#ffffff',
  topBarBorderColor: '#e7eef4',
  topBarHeaderColor: '#23282e',
  topBarTextColor: '#69788b',

  // Account Pages - Page Styles
  profileBackgroundColor: '#f6f8fa',
  pageTitle: '#23282e',
  bodyText: '#23282e',

  // Account Pages - Cards
  accountCardBackgroundColor: '#ffffff',
  accountCardOuterBorderColor: '#e7eef4',
  accountCardInnerBorderColor: '#e7eef4',
  accountCardHeaderColor: '#23282e',
  accountCardTextColor: '#5e6d82',
  accountCardTabActiveColor: '#e4f4fd',
  accountCardTabActiveBorderColor: '#109cf1',
  accountTableRowHoverColor: '#f6f8fa',
  accountCardInputBackgroundColor: '#ffffff',
  accountCardInputBorderColor: '#c0c9d5',
  accountCardInputFocusBorderColor: '#324054',
  accountCardInputSelectColor: '#edf7fd',
  accountCardInputSelectHoverColor: '#f6f8fa',
  accountCardInputTextColor: '#23282e',
  accountCardInputLabelColor: '#5e6d82',
  accountCardShadow: 3,

  // Account Pages - Logo
  logoProfile: '',
  logoProfileAltText: '',
  logoProfileCollapsed: '',
  logoProfileCollapsedAltText: '',
  logoProfileHeight: '24',
  logoProfileCollapsedHeight: '24',

  // Account Pages - Footer
  accountFooterEnabled: false,
  accountFooter: '<div class="d-flex justify-content-center py-4 w-100"><span class="pr-1">© 2021</span>\n<a href="#" target="_blank" class="text-body">My Company, Inc</a><a href="#" target="_blank" style="color: #0000ee" class="pl-3 text-body">Privacy Policy</a><a href="#" target="_blank" style="color: #0000ee" class="pl-3 text-body">Terms & Conditions</a></div>',

  // Account Pages - Profile Page Sections
  accountPageSections: {
    accountControls: { enabled: false },
    accountSecurity: {
      enabled: true,
      subsections: {
        password: { enabled: true },
        securityQuestions: { enabled: false },
        twoStepVerification: { enabled: true },
        username: { enabled: true }
      }
    },
    consent: { enabled: false },
    oauthApplications: { enabled: false },
    personalInformation: { enabled: true },
    preferences: { enabled: false },
    social: { enabled: false },
    trustedDevices: { enabled: true }
  }
};
