import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { MOBILE, initAds, showBanner, hideBanner } from '../lib/mobile.js'

// Routes that never carry a banner: the active workout (an overlay above the set controls
// would sit on top of the session) and Settings (where the removal is bought).
const NO_ADS = ['workout', 'settings']

// Mounted once in the app shell rather than per view, so moving between tabs does not
// tear the native banner down and build it again.
export default function AdBanner() {
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const isGuest = useStore(s => s.isGuest())
  const cur = useLocation().pathname.split('/')[1] || 'home'
  const show = MOBILE && (user || isGuest) && !NO_ADS.includes(cur) && S.adFree !== true

  useEffect(() => {
    if (!show) { hideBanner(); return }
    let live = true
    ;(async () => {
      await initAds()
      if (live) await showBanner(S.adFree)
    })()
    return () => { live = false; hideBanner() }
  }, [show])

  return null
}
