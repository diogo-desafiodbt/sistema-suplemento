import localFont from 'next/font/local'

export const gobold = localFont({
  src: [
    { path: '../fonts/gobold/Gobold-Light.otf', weight: '300', style: 'normal' },
    { path: '../fonts/gobold/Gobold-Light-Italic.otf', weight: '300', style: 'italic' },
    { path: '../fonts/gobold/Gobold-Regular.otf', weight: '400', style: 'normal' },
    { path: '../fonts/gobold/Gobold-Regular-Italic.otf', weight: '400', style: 'italic' },
    { path: '../fonts/gobold/Gobold-Bold.otf', weight: '700', style: 'normal' },
    { path: '../fonts/gobold/Gobold-Bold-Italic.otf', weight: '700', style: 'italic' },
  ],
  variable: '--font-gobold',
  display: 'swap',
})

export const moucha = localFont({
  src: [
    { path: '../fonts/moucha/Moucha-Light.otf', weight: '300', style: 'normal' },
    { path: '../fonts/moucha/Moucha-Regular.otf', weight: '400', style: 'normal' },
    { path: '../fonts/moucha/Moucha-Medium.ttf', weight: '500', style: 'normal' },
    { path: '../fonts/moucha/Moucha-Bold.otf', weight: '700', style: 'normal' },
    { path: '../fonts/moucha/Moucha-BoldItalic.otf', weight: '700', style: 'italic' },
    { path: '../fonts/moucha/Moucha-Black.otf', weight: '900', style: 'normal' },
  ],
  variable: '--font-moucha',
  display: 'swap',
})
