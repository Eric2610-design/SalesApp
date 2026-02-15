import DealerDetail from '@/app/ui/DealerDetail';

export default function Page({ params }) {
  return <DealerDetail id={params?.id} />;
}
