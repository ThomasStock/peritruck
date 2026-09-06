/** Glyphs for the yard operator's phone: the home screen tiles, the Yard
 * Operator App's tab bar and controls, and the loading-type pictograms. */
const svg = (viewBox: string, body: string, attrs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" aria-hidden="true"${attrs ? ` ${attrs}` : ""}>${body}</svg>`;
const stroke = (viewBox: string, body: string, width = 2) =>
  svg(
    viewBox,
    body,
    `fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`,
  );
/** The Peripass "P": the outer two strokes and the inner one of the wordmark. */
const P_OUTER =
  "M6.8,43.914a1.38,1.38,0,0,1-1.37-1.387v-28.1a8.954,8.954,0,0,1,8.925-8.98h2.77a13.553,13.553,0,0,1,.039,27.1H12.218a1.386,1.386,0,0,1,0-2.766h4.945A10.734,10.734,0,0,0,27.886,19.07a10.551,10.551,0,0,0-.828-4.215,10.791,10.791,0,0,0-9.934-6.64h-2.77a6.189,6.189,0,0,0-6.171,6.207V35.23h8.98a16.232,16.232,0,0,0-.031-32.464H14.354A11.6,11.6,0,0,0,3.667,9.9a11.7,11.7,0,0,0-.914,4.543v28.09a1.394,1.394,0,0,1-.66,1.273,1.381,1.381,0,0,1-1.43,0A1.4,1.4,0,0,1,0,42.527v-28.1a14.461,14.461,0,0,1,4.2-10.2A14.314,14.314,0,0,1,14.353,0h2.77A19.011,19.011,0,0,1,30.494,32.473,18.765,18.765,0,0,1,17.174,38h-9v4.531A1.383,1.383,0,0,1,6.8,43.914";
const P_INNER =
  "M11.288,32a1.365,1.365,0,0,1-.4-.973V14.421a3.5,3.5,0,0,1,3.493-3.507h2.754A8.045,8.045,0,0,1,17.174,27a1.37,1.37,0,0,1-1.367-1.373v0a1.37,1.37,0,0,1,1.365-1.375h0a5.3,5.3,0,0,0,5.285-5.262,5.239,5.239,0,0,0-1.535-3.746,5.3,5.3,0,0,0-3.785-1.586H14.381a.755.755,0,0,0-.754.758V31.032a1.371,1.371,0,0,1-2.34.972Z";
export const peripassTile = svg(
  "0 0 60 60",
  `<rect width="60" height="60" rx="13.5" fill="#00a88c"/><g transform="translate(16 9) scale(0.88)" fill="#fff"><path d="${P_OUTER}"/><path d="${P_INNER}"/></g>`,
);
/** Generic home-screen tiles: a colour and a simple white mark each. */
const tile = (fill: string, mark: string) =>
  svg(
    "0 0 60 60",
    `<rect width="60" height="60" rx="13.5" fill="${fill}"/>${mark}`,
  );
export const homeTiles: { name: string; svg: string }[] = [
  {
    name: "Messages",
    svg: tile(
      "#34c759",
      '<path fill="#fff" d="M30 14c-9.9 0-18 6.5-18 14.5 0 4.6 2.7 8.6 6.8 11.2-.3 2.2-1.3 4.2-2.8 5.8 3.4-.3 6.3-1.6 8.6-3.4 1.7.4 3.5.6 5.4.6 9.9 0 18-6.5 18-14.5S39.9 14 30 14z"/>',
    ),
  },
  {
    name: "Calendar",
    svg: tile(
      "#fff",
      '<rect width="60" height="17" rx="13.5" fill="#ff3b30"/><rect y="12" width="60" height="5" fill="#ff3b30"/><text x="30" y="47" text-anchor="middle" font-family="-apple-system, Helvetica, sans-serif" font-size="26" font-weight="300" fill="#111">6</text>',
    ),
  },
  {
    name: "Photos",
    svg: tile(
      "#fff",
      '<g transform="translate(30 30)"><circle r="9" cy="-13" fill="#ff9500" opacity=".85"/><circle r="9" cx="11" cy="-6.5" fill="#ffcc00" opacity=".85"/><circle r="9" cx="11" cy="6.5" fill="#34c759" opacity=".85"/><circle r="9" cy="13" fill="#5ac8fa" opacity=".85"/><circle r="9" cx="-11" cy="6.5" fill="#5856d6" opacity=".85"/><circle r="9" cx="-11" cy="-6.5" fill="#ff2d55" opacity=".85"/></g>',
    ),
  },
  {
    name: "Camera",
    svg: tile(
      "#8e8e93",
      '<rect x="12" y="20" width="36" height="24" rx="5" fill="#fff"/><rect x="22" y="15" width="12" height="7" rx="2" fill="#fff"/><circle cx="30" cy="32" r="8" fill="#8e8e93"/><circle cx="30" cy="32" r="5" fill="#fff"/>',
    ),
  },
  {
    name: "Maps",
    svg: tile(
      "#e8f4d6",
      '<path d="M0 38 L60 22" stroke="#f5d663" stroke-width="9"/><path d="M22 0 L38 60" stroke="#fff" stroke-width="6"/><circle cx="36" cy="27" r="7" fill="#ff3b30"/><circle cx="36" cy="27" r="3" fill="#fff"/>',
    ),
  },
  {
    name: "Clock",
    svg: tile(
      "#fff",
      '<circle cx="30" cy="30" r="22" fill="#111"/><circle cx="30" cy="30" r="19" fill="#fff"/><path d="M30 17v13l9 6" stroke="#111" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M30 30 L20 24" stroke="#ff9500" stroke-width="1.6"/>',
    ),
  },
  {
    name: "Weather",
    svg: tile(
      "#3a8be0",
      '<circle cx="24" cy="24" r="9" fill="#ffd60a"/><path fill="#fff" d="M20 44a8 8 0 0 1 1.5-15.8A11 11 0 0 1 42.5 31 6.5 6.5 0 0 1 43 44z"/>',
    ),
  },
  {
    name: "Mail",
    svg: tile(
      "#1a8cff",
      '<rect x="11" y="17" width="38" height="26" rx="4" fill="#fff"/><path d="M11 21 30 34 49 21" fill="none" stroke="#1a8cff" stroke-width="2.5"/>',
    ),
  },
  {
    name: "Notes",
    svg: tile(
      "#fff",
      '<rect width="60" height="16" fill="#ffd60a"/><path d="M14 27h32M14 36h32M14 45h20" stroke="#c7c7cc" stroke-width="2.2" stroke-linecap="round"/>',
    ),
  },
  {
    name: "Settings",
    svg: tile(
      "#8e8e93",
      '<circle cx="30" cy="30" r="17" fill="#d1d1d6"/><circle cx="30" cy="30" r="12" fill="#8e8e93"/><circle cx="30" cy="30" r="5" fill="#d1d1d6"/><g stroke="#d1d1d6" stroke-width="4">' +
        [0, 45, 90, 135, 180, 225, 270, 315]
          .map((a) => `<path d="M30 9v6" transform="rotate(${a} 30 30)"/>`)
          .join("") +
        "</g>",
    ),
  },
  { name: "Peripass Yard", svg: peripassTile },
];
export const dockTiles: { name: string; svg: string }[] = [
  {
    name: "Phone",
    svg: tile(
      "#34c759",
      '<path fill="#fff" d="M20.5 15.6c1.2-.7 2.8-.3 3.5.9l3 5.3c.6 1.1.4 2.5-.6 3.3l-2.4 2a1 1 0 0 0-.3 1.1c1.6 4 4.6 7 8.6 8.6.4.2.9.1 1.1-.3l2-2.4c.8-1 2.2-1.2 3.3-.6l5.3 3c1.2.7 1.6 2.3.9 3.5l-1.6 2.7c-1.3 2.2-3.9 3.3-6.4 2.7-9.6-2.3-17.1-9.8-19.4-19.4-.6-2.5.5-5.1 2.7-6.4z"/>',
    ),
  },
  {
    name: "Safari",
    svg: tile(
      "#1a8cff",
      '<circle cx="30" cy="30" r="20" fill="#fff"/><path d="M40 20 33 33 20 40 27 27z" fill="#ff3b30"/><path d="M20 40 27 27 33 33z" fill="#111" opacity=".85"/>',
    ),
  },
  {
    name: "Messages",
    svg: tile(
      "#34c759",
      '<path fill="#fff" d="M30 14c-9.9 0-18 6.5-18 14.5 0 4.6 2.7 8.6 6.8 11.2-.3 2.2-1.3 4.2-2.8 5.8 3.4-.3 6.3-1.6 8.6-3.4 1.7.4 3.5.6 5.4.6 9.9 0 18-6.5 18-14.5S39.9 14 30 14z"/>',
    ),
  },
  {
    name: "Music",
    svg: tile(
      "#fc3c44",
      '<path fill="#fff" d="M38 14v22.5a6.5 6.5 0 1 1-4-6V21l-10 2.5v16A6.5 6.5 0 1 1 20 33.5V19z"/>',
    ),
  },
];
export const icons = {
  /** FontAwesome 5 "tasks", the Tasks tab. */
  tasks: svg(
    "0 0 512 512",
    '<path fill="currentColor" d="M139.6 35.5c-12.5-12.5-32.8-12.5-45.3 0L64 65.8l-5.7-5.7c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l28 28c12.5 12.5 32.8 12.5 45.3 0l84-84c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L139.6 35.5zm0 192c-12.5-12.5-32.8-12.5-45.3 0L64 257.8l-5.7-5.7c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l28 28c12.5 12.5 32.8 12.5 45.3 0l84-84c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L139.6 227.5zM64 400a48 48 0 1 0 0 96 48 48 0 1 0 0-96zm160-16h256c17.7 0 32-14.3 32-32s-14.3-32-32-32H224c-17.7 0-32 14.3-32 32s14.3 32 32 32zm0-192h256c17.7 0 32-14.3 32-32s-14.3-32-32-32H224c-17.7 0-32 14.3-32 32s14.3 32 32 32zm-32 224c0 17.7 14.3 32 32 32h256c17.7 0 32-14.3 32-32s-14.3-32-32-32H224c-17.7 0-32 14.3-32 32z"/>',
  ),
  /** FontAwesome 5 "truck", the Call-off tab. */
  truck: svg(
    "0 0 640 512",
    '<path fill="currentColor" d="M624 352h-16V243.9c0-12.7-5.1-24.9-14.1-33.9L494 110.1c-9-9-21.2-14.1-33.9-14.1H416V48c0-26.5-21.5-48-48-48H48C21.5 0 0 21.5 0 48v320c0 26.5 21.5 48 48 48h16c0 53 43 96 96 96s96-43 96-96h128c0 53 43 96 96 96s96-43 96-96h48c8.8 0 16-7.2 16-16v-32c0-8.8-7.2-16-16-16zM160 464c-26.5 0-48-21.5-48-48s21.5-48 48-48 48 21.5 48 48-21.5 48-48 48zm320 0c-26.5 0-48-21.5-48-48s21.5-48 48-48 48 21.5 48 48-21.5 48-48 48zm80-208H416V144h44.1l99.9 99.9V256z"/>',
  ),
  /** Ionicons "settings-outline", the Settings tab. */
  settings: stroke(
    "0 0 24 24",
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    1.8,
  ),
  /** Ionicons "options": three sliders, the queue's filter button. */
  options: svg(
    "0 0 24 24",
    '<g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></g><circle cx="16" cy="6" r="2.6" fill="currentColor"/><circle cx="8" cy="12" r="2.6" fill="currentColor"/><circle cx="14" cy="18" r="2.6" fill="currentColor"/>',
  ),
  /** FontAwesome 6 "sliders", the picker's filter toggle. */
  sliders: svg(
    "0 0 24 24",
    '<g stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></g><rect x="14" y="3.5" width="4" height="5" rx="1" fill="currentColor"/><rect x="6" y="9.5" width="4" height="5" rx="1" fill="currentColor"/><rect x="11" y="15.5" width="4" height="5" rx="1" fill="currentColor"/>',
  ),
  chevronDown: stroke("0 0 24 24", '<path d="m7 10 5 5 5-5"/>', 2),
  chevronRight: stroke("0 0 24 24", '<path d="m10 7 5 5-5 5"/>', 2),
  /** iOS back chevron in the stack header. */
  back: stroke("0 0 12 20", '<path d="M10 2 2 10l8 8"/>', 2.4),
  /** AntDesign "check", the selected location. */
  check: stroke("0 0 24 24", '<path d="m4 12.5 5.5 5.5L20 6.5"/>', 2.6),
  /** FontAwesome "phone", next to a phone-number field. */
  phone: svg(
    "0 0 24 24",
    '<path fill="currentColor" d="M6.6 3.4c.6-.4 1.4-.2 1.8.4l1.7 3c.4.6.2 1.4-.3 1.9L8.4 9.8a.5.5 0 0 0-.1.6c1 2.3 2.7 4 5 5a.5.5 0 0 0 .6-.1l1.1-1.4c.5-.6 1.3-.7 1.9-.3l3 1.7c.6.4.8 1.2.4 1.8l-.9 1.5c-.7 1.2-2.1 1.8-3.5 1.5A15.8 15.8 0 0 1 5 9c-.3-1.4.3-2.8 1.5-3.5z"/>',
  ),
  /** MaterialIcons "error-outline". */
  error: stroke(
    "0 0 24 24",
    '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.2v.3"/>',
    2,
  ),
  /** Loading type "LiveLoading": the trailer is loaded while the driver waits. */
  liveLoading: svg(
    "0 0 40 30",
    '<g fill="#fff"><path d="M2 5h23a2 2 0 0 1 2 2v13H2z"/><path d="M27 10h5.5a3 3 0 0 1 2.4 1.2l3 4.2c.4.5.6 1.1.6 1.8V20H27z"/><circle cx="9" cy="23.5" r="3.2"/><circle cx="31" cy="23.5" r="3.2"/></g><g fill="#00a88c"><rect x="6" y="9" width="5" height="5" rx=".6"/><rect x="12.5" y="9" width="5" height="5" rx=".6"/><rect x="6" y="15" width="5" height="4" rx=".6"/><rect x="12.5" y="15" width="5" height="4" rx=".6"/></g><path d="M20.5 2.5h9M27 0l2.5 2.5L27 5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  /** The production app's outline for a full trailer to unload, tinted by CSS. */
  fullDropOffOutline: svg(
    "0 0 18 15",
    '<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M17.9888 0.641166V9.22474e-07H10.7944C10.6762 -0.000166984 10.5592 0.022588 10.45 0.0669629C10.3407 0.111338 10.2415 0.17646 10.1579 0.258598C10.0743 0.340737 10.0081 0.438276 9.96294 0.545627C9.91779 0.652978 9.89464 0.76803 9.89481 0.884191V10.2916L0.167977 12.8563C0.139345 12.8637 0.112475 12.8766 0.0889063 12.8942C0.0653376 12.9118 0.0455326 12.9338 0.0306255 12.9589C0.0157185 12.984 0.0060021 13.0118 0.0020328 13.0406C-0.00193651 13.0695 -8.07692e-05 13.0988 0.00749374 13.1269L0.241694 13.9778C0.249203 14.0059 0.262285 14.0323 0.280193 14.0555C0.2981 14.0786 0.320481 14.0981 0.346053 14.1128C0.371625 14.1274 0.399887 14.137 0.42922 14.1409C0.458552 14.1448 0.48838 14.1429 0.516994 14.1355L11.7077 11.1861C11.7419 11.9407 12.0559 12.6569 12.5903 13.1997C13.1247 13.7426 13.8428 14.0745 14.609 14.1328C15.3753 14.1912 16.1368 13.9721 16.7499 13.5167C17.3631 13.0613 17.7856 12.4011 17.9377 11.6607C18.0898 10.9203 17.9611 10.1508 17.5757 9.49722C17.4652 9.30965 17.3356 9.13535 17.1899 8.97653H17.9953V0.641166H17.9888ZM14.8411 9.28046C15.1968 9.28046 15.5445 9.38414 15.8403 9.57838C16.1361 9.77262 16.3666 10.0487 16.5028 10.3717C16.6389 10.6947 16.6745 11.0502 16.6051 11.3931C16.5357 11.736 16.3644 12.051 16.1129 12.2982C15.8613 12.5454 15.5409 12.7138 15.192 12.782C14.8431 12.8502 14.4814 12.8152 14.1528 12.6814C13.8241 12.5476 13.5432 12.321 13.3456 12.0303C13.148 11.7396 13.0425 11.3978 13.0425 11.0482C13.043 10.5795 13.2327 10.1302 13.5699 9.79878C13.907 9.46738 14.3642 9.28097 14.8411 9.28046Z"/><path fill="currentColor" d="M3.07355 6.42397H7.21088C7.27836 6.42397 7.34307 6.39763 7.39079 6.35073C7.4385 6.30384 7.46531 6.24023 7.46531 6.17391V5.00632C7.46531 4.94 7.4385 4.8764 7.39079 4.8295C7.34307 4.78261 7.27836 4.75626 7.21088 4.75626H3.07355V3.79449C3.07367 3.69549 3.04389 3.59868 2.98799 3.51633C2.93208 3.43398 2.85257 3.36978 2.75951 3.33188C2.66646 3.29398 2.56406 3.28408 2.46527 3.30342C2.36648 3.32277 2.27576 3.37049 2.2046 3.44056L0.377962 5.23586C0.283149 5.32957 0.229928 5.45636 0.229928 5.58851C0.229928 5.72067 0.283149 5.84746 0.377962 5.94116L2.2046 7.73647C2.27569 7.80646 2.36629 7.85416 2.46495 7.87354C2.56361 7.89293 2.66591 7.88313 2.75891 7.84539C2.85191 7.80765 2.93144 7.74366 2.98744 7.6615C3.04345 7.57934 3.07341 7.48271 3.07355 7.38382V6.42397Z"/>',
  ),
  /** The production app's success mark. */
  success: svg(
    "0 0 120 120",
    '<circle cx="60" cy="60" r="60" fill="#DFF3EF" fill-opacity=".5"/><circle cx="60" cy="60" r="42" fill="#DFF3EF" fill-opacity=".8"/><path fill="#00AA8B" d="M60 84c-8.625 0-16.5-4.5-20.813-12-4.312-7.406-4.312-16.5 0-24C43.5 40.594 51.376 36 60 36c8.531 0 16.406 4.594 20.719 12 4.312 7.5 4.312 16.594 0 24C76.406 79.5 68.53 84 60 84Zm10.594-28.406H70.5c.938-.844.938-2.25 0-3.188a2.207 2.207 0 0 0-3.094 0L57 62.906 52.594 58.5c-.938-.938-2.344-.938-3.188 0a2.053 2.053 0 0 0 0 3.094l6 6c.844.937 2.25.937 3.188 0l12-12Z"/>',
  ),
  /** Torch and camera shortcuts on the lock screen. */
  torch: svg(
    "0 0 24 24",
    '<path fill="currentColor" d="M8 2h8v3l-2 3v12a2 2 0 0 1-2 2 2 2 0 0 1-2-2V8L8 5z"/><rect x="11.2" y="10" width="1.6" height="4" rx=".8" fill="#000" opacity=".5"/>',
  ),
  camera: svg(
    "0 0 24 24",
    '<path fill="currentColor" d="M4 7h3l1.5-2h7L17 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="3.5" fill="#000" opacity=".55"/>',
  ),
};
