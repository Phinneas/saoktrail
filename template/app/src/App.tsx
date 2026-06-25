import { useEffect, useRef, useState } from 'react'
import './App.css'

interface RegionCard {
  title: string
  subtitle: string
  description: string
  link: string
  image: string
  location: string
}

const regions: RegionCard[] = [
  {
    title: 'Washington Hot Springs',
    subtitle: 'Pacific Northwest Soaks',
    description: 'From moss-carpeted rainforest pools to Cascade mountain retreats, discover Washington\'s hidden thermal treasures among ancient evergreens and misty valleys.',
    link: 'https://www.washingtonhotsprings.com',
    image: '/washington-hotspring.jpg',
    location: 'Washington State'
  },
  {
    title: 'Soak Colorado',
    subtitle: 'Rocky Mountain Mineral Waters',
    description: 'Colorado sits atop remarkable geothermal activity with over 30 developed resorts and countless primitive soaking spots scattered throughout the Rockies.',
    link: 'https://www.soakcolorado.com',
    image: '/colorado-hotspring.jpg',
    location: 'Colorado'
  },
  {
    title: 'Shasta Hot Springs',
    subtitle: 'Northern California & Southern Oregon',
    description: 'Sacred waters beneath the shadow of Mount Shasta. Explore volcanic thermal pools, creekside soaking, and healing mineral springs in the spiritual heart of the Cascades.',
    link: 'https://www.shastahotsprings.com',
    image: '/shasta-hotspring.jpg',
    location: 'Mount Shasta Region'
  },
  {
    title: 'Soak the Rockies',
    subtitle: 'Idaho, Montana & Wyoming',
    description: 'A geological survey-style directory of the Northern Rockies\' best hot springs. Find natural thermal pools with real-time conditions across vast wilderness landscapes.',
    link: 'https://www.soaktherockies.com',
    image: '/rockies-hotspring.jpg',
    location: 'Northern Rockies'
  },
  {
    title: 'Desert Soak',
    subtitle: 'Desert Oasis Thermal Pools',
    description: 'Discover steaming oases tucked between red rock canyons and sagebrush valleys. The Southwest holds hundreds of natural springs in its dramatic desert terrain.',
    link: 'https://www.desertsoak.com',
    image: '/desert-hotspring.jpg',
    location: 'Southwest Desert'
  }
]

function App() {
  const [scrolled, setScrolled] = useState(false)
  const [visibleCards, setVisibleCards] = useState<Set<number>>(new Set())
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const heroRef = useRef<HTMLDivElement>(null)
  const [heroParallax, setHeroParallax] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY
      setScrolled(scrollY > 50)
      setHeroParallax(scrollY * 0.4)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const observers: IntersectionObserver[] = []

    cardRefs.current.forEach((ref, index) => {
      if (!ref) return

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setVisibleCards((prev) => new Set(prev).add(index))
            }
          })
        },
        { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
      )

      observer.observe(ref)
      observers.push(observer)
    })

    return () => observers.forEach((obs) => obs.disconnect())
  }, [])

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      {/* Navigation */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-[#faf8f5]/95 backdrop-blur-md shadow-sm py-4'
            : 'bg-transparent py-6'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <a
            href="/"
            className="flex items-center gap-3 group"
          >
            <div className="w-10 h-10 rounded-full bg-[#b8915f] flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2c0 4-4 8-4 14 0 2.2 1.8 4 4 4s4-1.8 4-4c0-6-4-10-4-14z"/>
                <path d="M9 21h6"/>
              </svg>
            </div>
            <span className={`font-serif text-2xl font-semibold tracking-tight transition-colors duration-300 ${scrolled ? 'text-[#1a1a1a]' : 'text-white'}`}>
              Soak America
            </span>
          </a>

          <div className="hidden md:flex items-center gap-8">
            {['Destinations', 'About', 'Contact'].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className={`text-sm font-medium tracking-wide uppercase transition-colors duration-300 hover:text-[#b8915f] ${
                  scrolled ? 'text-[#1a1a1a]' : 'text-white/90'
                }`}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                {item}
              </a>
            ))}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
      >
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-100 ease-linear"
          style={{
            backgroundImage: 'url(/hero-hotspring.jpg)',
            transform: `translateY(${heroParallax}px) scale(1.15)`
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60" />

        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
          <p
            className="text-white/80 text-sm md:text-base tracking-[0.3em] uppercase mb-6"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Discover the American West
          </p>
          <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl font-light text-white leading-[1.1] mb-8">
            Find Your
            <span className="italic font-light block mt-2">Perfect Soak</span>
          </h1>
          <p className="text-white/80 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-12 font-light">
            From desert oasis pools to alpine thermal retreats, explore the West's most remarkable natural hot springs.
          </p>
          <a
            href="#destinations"
            className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-sm border border-white/30 text-white px-8 py-4 rounded-full hover:bg-white/20 hover:border-white/50 transition-all duration-300 group"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            <span className="text-sm font-medium tracking-wide uppercase">Explore Destinations</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="group-hover:translate-y-1 transition-transform duration-300"
            >
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </a>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" opacity="0.6">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </div>
      </section>

      {/* Introduction Section */}
      <section className="py-24 md:py-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p
            className="text-[#b8915f] text-sm tracking-[0.3em] uppercase mb-6"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Natural Thermal Waters
          </p>
          <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-light text-[#1a1a1a] leading-tight mb-10">
            Earth's Ancient
            <span className="italic"> Healing Gift</span>
          </h2>
          <div className="space-y-6 text-[#4a4a4a] text-lg leading-relaxed max-w-3xl mx-auto">
            <p>
              For thousands of years, indigenous peoples across the American West have revered natural hot springs as sacred healing waters. From the Ute tribes of Colorado to the Washoe people of the Eastern Sierra, these geothermal wonders have served as places of restoration, ceremony, and communion with nature.
            </p>
            <p>
              Today, the West remains home to some of the world's most diverse and spectacular hot springs. Mineral-rich waters bubble up through ancient volcanic rock, creating everything from remote wilderness pools to world-class resort experiences — each with its own character, chemistry, and sense of place.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { number: '500+', label: 'Natural Springs Mapped' },
              { number: '5', label: 'Regional Guides' },
              { number: '12', label: 'States Covered' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <p className="font-serif text-5xl md:text-6xl font-light text-[#b8915f] mb-2">{stat.number}</p>
                <p className="text-[#4a4a4a] text-sm tracking-wider uppercase" style={{ fontFamily: 'Inter, sans-serif' }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-7xl mx-auto px-6">
        <div className="h-px bg-[#e5e0d8]" />
      </div>

      {/* Destinations Section */}
      <section id="destinations" className="py-24 md:py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <p
              className="text-[#b8915f] text-sm tracking-[0.3em] uppercase mb-6"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Regional Guides
            </p>
            <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-light text-[#1a1a1a] leading-tight">
              Choose Your
              <span className="italic"> Destination</span>
            </h2>
          </div>

          <div className="space-y-16 md:space-y-24">
            {regions.map((region, index) => (
              <div
                key={region.title}
                ref={(el) => { cardRefs.current[index] = el }}
                className={`group grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center transition-all duration-700 ${
                  visibleCards.has(index)
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-12'
                }`}
              >
                {/* Image */}
                <div className={`relative overflow-hidden rounded-2xl ${index % 2 === 1 ? 'lg:order-2' : ''}`}>
                  <div className="aspect-[4/3] overflow-hidden">
                    <img
                      src={region.image}
                      alt={region.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      loading="lazy"
                    />
                  </div>
                  <div className="absolute top-6 left-6 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full">
                    <span className="text-xs font-medium text-[#1a1a1a] tracking-wide uppercase" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {region.location}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className={`${index % 2 === 1 ? 'lg:order-1 lg:text-right' : ''}`}>
                  <p
                    className="text-[#b8915f] text-xs tracking-[0.25em] uppercase mb-4"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    {region.subtitle}
                  </p>
                  <h3 className="font-serif text-3xl md:text-4xl font-medium text-[#1a1a1a] mb-6">
                    {region.title}
                  </h3>
                  <p className="text-[#4a4a4a] text-lg leading-relaxed mb-8 max-w-lg">
                    {region.description}
                  </p>
                  <a
                    href={region.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-3 text-[#1a1a1a] hover:text-[#b8915f] transition-colors duration-300 group/link ${
                      index % 2 === 1 ? 'flex-row-reverse' : ''
                    }`}
                  >
                    <span
                      className="text-sm font-medium tracking-wide uppercase border-b border-current pb-1"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      Visit Website
                    </span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={`group-hover/link:translate-x-1 transition-transform duration-300 ${
                        index % 2 === 1 ? 'rotate-180 group-hover/link:-translate-x-1' : ''
                      }`}
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-7xl mx-auto px-6">
        <div className="h-px bg-[#e5e0d8]" />
      </div>

      {/* About / Philosophy Section */}
      <section id="about" className="py-24 md:py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p
                className="text-[#b8915f] text-sm tracking-[0.3em] uppercase mb-6"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Our Philosophy
              </p>
              <h2 className="font-serif text-4xl md:text-5xl font-light text-[#1a1a1a] leading-tight mb-8">
                Preserving the Soak
                <span className="italic"> for Generations</span>
              </h2>
              <div className="space-y-5 text-[#4a4a4a] text-lg leading-relaxed">
                <p>
                  Hot springs are fragile ecosystems. The same geothermal forces that create these magical pools can be disrupted by overuse, pollution, and disrespect. We believe in responsible soaking — leaving no trace, respecting local customs, and preserving these natural wonders for future generations.
                </p>
                <p>
                  Each of our regional partner sites shares this commitment. They provide accurate, up-to-date information on access conditions, seasonal closures, and local etiquette so you can enjoy these springs responsibly.
                </p>
              </div>

              <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
                {[
                  'Leave No Trace',
                  'Respect Local Customs',
                  'Check Seasonal Access',
                  'Support Local Communities'
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#b8915f] flex-shrink-0" />
                    <span className="text-[#4a4a4a] text-sm font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="aspect-[3/4] rounded-2xl overflow-hidden">
                <img
                  src="/hero-hotspring.jpg"
                  alt="Natural hot spring pool"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="absolute -bottom-8 -left-8 bg-[#1a1a1a] text-white p-8 rounded-2xl max-w-xs hidden md:block">
                <p className="font-serif text-2xl italic leading-relaxed">
                  "The water remembers. Treat it with reverence."
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-20 px-6 bg-[#1a1a1a]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-light text-white leading-tight mb-6">
            Ready to Find Your
            <span className="italic"> Perfect Spring?</span>
          </h2>
          <p className="text-white/60 text-lg mb-10 max-w-2xl mx-auto">
            Browse our regional guides for detailed maps, reviews, seasonal tips, and everything you need to plan your next hot springs adventure.
          </p>
          <a
            href="#destinations"
            className="inline-flex items-center gap-3 bg-[#b8915f] text-white px-8 py-4 rounded-full hover:bg-[#9a7748] transition-colors duration-300"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            <span className="text-sm font-medium tracking-wide uppercase">Explore All Regions</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="bg-[#0f0f0f] text-white py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-[#b8915f] flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2c0 4-4 8-4 14 0 2.2 1.8 4 4 4s4-1.8 4-4c0-6-4-10-4-14z"/>
                    <path d="M9 21h6"/>
                  </svg>
                </div>
                <span className="font-serif text-2xl font-semibold">Soak America</span>
              </div>
              <p className="text-white/50 text-base leading-relaxed max-w-md">
                Your trusted guide to the American West's finest natural hot springs. We connect soakers with authentic thermal experiences across five unique regions.
              </p>
            </div>

            <div>
              <h4
                className="text-xs font-medium tracking-[0.2em] uppercase text-white/40 mb-6"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Regional Sites
              </h4>
              <ul className="space-y-3">
                {regions.map((region) => (
                  <li key={region.title}>
                    <a
                      href={region.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/60 hover:text-[#b8915f] transition-colors duration-300 text-sm"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      {region.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4
                className="text-xs font-medium tracking-[0.2em] uppercase text-white/40 mb-6"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Quick Links
              </h4>
              <ul className="space-y-3">
                {['Home', 'Destinations', 'About', 'Contact'].map((item) => (
                  <li key={item}>
                    <a
                      href={`#${item.toLowerCase()}`}
                      className="text-white/60 hover:text-[#b8915f] transition-colors duration-300 text-sm"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-white/30 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
              © {new Date().getFullYear()} Soak America. All rights reserved.
            </p>
            <p className="text-white/30 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
              Connecting soakers with America's best hot springs.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
