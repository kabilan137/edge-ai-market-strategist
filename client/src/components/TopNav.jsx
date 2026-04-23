import { useState } from 'react';
import { Search, MapPin, Compass, ChevronDown, Loader2, Tag, ShoppingBag, Store } from 'lucide-react';

export default function TopNav({ onSearch, isLoading }) {
  const [searchMode, setSearchMode] = useState('shop'); // 'shop' or 'product'
  const [searchLocation, setSearchLocation] = useState('');
  const [searchCategory, setSearchCategory] = useState('');
  const [searchProduct, setSearchProduct] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (searchMode === 'shop' && searchLocation && searchCategory && onSearch) {
      onSearch(searchMode, searchLocation, searchCategory, searchProduct);
    } else if (searchMode === 'product' && searchLocation && searchProduct && onSearch) {
      onSearch(searchMode, searchLocation, searchCategory, searchProduct);
    }
  };

  const isSubmitDisabled = isLoading || !searchLocation ||
    (searchMode === 'shop' && !searchCategory) ||
    (searchMode === 'product' && !searchProduct);

  return (
    <nav className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 z-50 shadow-sm relative">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 bg-blue-700 text-white shadow-sm">
          <Compass size={20} />
        </div>
        <span className="font-semibold text-lg text-slate-900 tracking-tight">Market Opportunity Scout</span>
      </div>
      
      <form onSubmit={handleSubmit} className="flex items-center gap-4 flex-1 max-w-5xl px-8">
        
        {/* Mode Toggle */}
        <div className="flex items-center bg-slate-100 p-1 rounded border border-slate-200">
          <button
            type="button"
            onClick={() => setSearchMode('shop')}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors rounded ${searchMode === 'shop' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Store size={16} /> Shop
          </button>
          <button
            type="button"
            onClick={() => setSearchMode('product')}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors rounded ${searchMode === 'product' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <ShoppingBag size={16} /> Product
          </button>
        </div>

        <div className="flex flex-1 items-center border border-slate-300 bg-slate-50 focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-600 transition-all">
          <div className="pl-3 text-slate-400">
            <MapPin size={18} />
          </div>
          <input 
            type="text" 
            value={searchLocation}
            onChange={(e) => setSearchLocation(e.target.value)}
            placeholder={searchMode === 'shop' ? "Competitor Location (e.g., Madurai)..." : "Target Launch Market (e.g., Kodaikanal)..."} 
            className="w-full px-3 py-2 bg-transparent text-sm outline-none text-slate-900 placeholder:text-slate-500"
          />
        </div>

        {searchMode === 'shop' && (
          <div className="relative flex flex-1 items-center border border-slate-300 bg-white hover:border-slate-400 transition-colors">
            <select 
              value={searchCategory}
              onChange={(e) => setSearchCategory(e.target.value)}
              className="w-full pl-3 pr-8 py-2 bg-transparent text-sm outline-none text-slate-900 appearance-none cursor-pointer"
            >
              <option value="">Category</option>
              <option value="cafe">Cafe & Coffee Shops</option>
              <option value="pharmacy">Pharmacies</option>
              <option value="repair">Auto Repair</option>
              <option value="gym">Fitness Centers</option>
            </select>
            <div className="absolute right-3 pointer-events-none text-slate-500">
              <ChevronDown size={16} />
            </div>
          </div>
        )}

        <div className="flex flex-1 items-center border border-slate-300 bg-slate-50 focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-600 transition-all">
          <div className="pl-3 text-slate-400">
            <Tag size={18} />
          </div>
          <input 
            type="text" 
            value={searchProduct}
            onChange={(e) => setSearchProduct(e.target.value)}
            placeholder={searchMode === 'product' ? "Enter exact product name..." : "Specific Product (Optional)..."} 
            className="w-full px-3 py-2 bg-transparent text-sm outline-none text-slate-900 placeholder:text-slate-500"
          />
        </div>

        <button 
          type="submit" 
          disabled={isSubmitDisabled}
          className="px-5 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white text-sm font-medium transition-colors shadow-sm flex items-center gap-2 rounded-none"
        >
          {isLoading && <Loader2 size={16} className="animate-spin" />}
          Search
        </button>
      </form>

      <div className="flex items-center">
        <button className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium transition-colors shadow-sm">
          Export Report
        </button>
      </div>
    </nav>
  );
}
