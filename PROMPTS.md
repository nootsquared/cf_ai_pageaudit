# Prompts

A record of prompts used while building this project.

---

## 3 — Dashboard View & Animated Transitions

> Once the user enters something in the search bar, new components will appear, but the background and everything will stay the same so it looks like components reordering animated. Each component will receive an entry animation starting from nothing and expanding into its component state. We should have the url we entered at the top (this should be a dashboard format so no more dots background). A button to the right of the link saying check another that will lead you back to the first page. then information about your specific result like Credibility score (some percent), a counter for true claims, a counter for false claims, and a counter for claims that were not able to be verified. then a tabbed list of all claims, true claims, false, and unverifiable claims so they are clearly distinct from each other. There should also be a UI that shows active agents if they are running using the multi-step loader component UI somewhere. All of this should be added without any functionality right now, but as a template so I can add functionality on top of everything.

---

## 2 — Typography, Frosted Glass & Input Refinements

> Swap the Site-Seer font, and instead of SITESEER make it Site-Seer. Don't make the font that bold and obstructive. Give all the text components in the center a frosted glass background that allows the focus to stay on the center components while maintaining clarity and visibility of the background, so the view remains aesthetic. Increase the starting length of the input text box. Make all the subtext more visible with a darker color since on the dotted background it is difficult to see.

---

## 1 — Initial Landing Page Design

> Lets start work on the front end design. Start with a white empty page and a interactive dot grid background. In the center we should have the title text which reads Siteseer in a big bold techy font. Use the existing encrypted text component, modify it to use it on the title. The underneath it for the description have it say "Developed by Pranav Maringanti" and have Pranav Maringanti in another color slightly bolder, the subtext should also be in a techy font. If you hover over my name, it should give you a tooltip using the existing tooltip component I have added to open a tooltip with my github, linked in, resume, and website all linked (add arbitrary links for now). The under those components add a new component that I have also already implimented called sticky input, and for the pretext have "Enter website URL". Have some subtext under the input bar component reading "Add a URL to parse through and scan for falso information" in a smaller and more discrete techy format. Expanding on the background, the dots should be darker black contrasting and they should use the motion library and smoothly interact with the user while they move their mouse around. when the user clicks anywhere (including on another component) the dots should replicate a smooth synchronouse ripple like effect spanning the entire page. It should look very bubly and animated, ensure to use the motion library to accurately add these animations to the background dots.
