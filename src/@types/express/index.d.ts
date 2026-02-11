import { User as AppUser } from '../../auth/entities/user.entity';

declare global {
  namespace Express {
    interface User extends AppUser {}
  }
}
