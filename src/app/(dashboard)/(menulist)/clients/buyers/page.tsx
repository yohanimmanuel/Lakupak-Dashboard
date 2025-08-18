import Statcards from '@/components/clientmanagement/Statcards';
import BuyerTable from "@/components/clientmanagement/BuyerTable";

export default function BuyersPage() {
  return (
    <div className="p-4 w-full min-h-screen flex flex-col items-right bg-gradient-to-b from-gray-50 to-white">
      <div className="items-right justify-start gap-4 mb-2">
        <h2 className="text-2xl font-bold text-black mb-2">Buyers List</h2>
        <p className="text-sm text-gray-500 mb-2">Manage your buyers and their information.</p>
      </div>
      <Statcards type="buyer" />
      <BuyerTable />
    </div>
  );
}
  