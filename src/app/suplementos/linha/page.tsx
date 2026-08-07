import Header from '@/components/Header'
import Footer from '@/components/Footer'
import CategoryCarousel from '@/components/CategoryCarousel'

/** Página interna da linha de produtos — não linkada no funil principal. */
export default function LinhaSuplementosPage() {
  return (
    <>
      <Header />
      <main className="bg-white py-14 md:py-16 px-5 md:px-6">
        <div className="max-w-6xl mx-auto">
          <CategoryCarousel />
        </div>
      </main>
      <Footer />
    </>
  )
}
