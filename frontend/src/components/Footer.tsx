export default function Footer() {
  return (
    <footer className="border-t border-white/10 mt-auto bg-black/50 backdrop-blur-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm text-gray-400">
            <p className="font-light text-white/80 tracking-wide">PFMEA Analysis Tool</p>
            <p className="font-thin text-gray-500 tracking-wide">Automated Process Failure Mode and Effects Analysis</p>
          </div>
          <div className="text-sm text-gray-500">
            <p>© {new Date().getFullYear()} All rights reserved</p>
          </div>
        </div>
      </div>
    </footer>
  )
}

