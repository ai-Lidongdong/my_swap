import { withApiHandler } from '@/app/api/_utils/response';
import { listAllPoolInfos } from '@/app/models/poolInfoModel';

export async function GET() {
  return withApiHandler(
    async () => {
      const list = await listAllPoolInfos();
      return {
        list,
        total: list.length,
      };
    },
    {
      successMessage: '查询池子列表成功',
      errorMessage: '查询池子列表失败',
    },
  );
}
