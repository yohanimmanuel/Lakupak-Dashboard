import OfferEditorForm from '@/components/adminstuffs/OfferEditorForm';

export default function NewOfferPage() {
  return (
    <OfferEditorForm
      mode="create"
      pageTitle="New offer"
      pageDescription="Configure the homepage sale banner and the screen buyers see after they tap it."
    />
  );
}
