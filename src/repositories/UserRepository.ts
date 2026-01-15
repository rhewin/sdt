import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { User } from '../models/User';
import { CreateUserDto, UpdateUserDto } from '../types';

export class UserRepository {
  private repository: Repository<User>;

  constructor() {
    this.repository = AppDataSource.getRepository(User);
  }

  async create(data: CreateUserDto): Promise<User> {
    const user = this.repository.create({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      birthDate: new Date(data.birthDate),
      timezone: data.timezone,
    });

    return await this.repository.save(user);
  }

  async findById(id: string): Promise<User | null> {
    return await this.repository.findOne({
      where: { id },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.repository.findOne({
      where: { email },
    });
  }

  async update(id: string, data: UpdateUserDto): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) {
      return null;
    }

    if (data.firstName) user.firstName = data.firstName;
    if (data.lastName) user.lastName = data.lastName;
    if (data.email) user.email = data.email;
    if (data.birthDate) user.birthDate = new Date(data.birthDate);
    if (data.timezone) user.timezone = data.timezone;

    return await this.repository.save(user);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.repository.softDelete(id);
    return (result.affected ?? 0) > 0;
  }

  async findUsersWithBirthdayInWindow(_startTime: Date, _endTime: Date): Promise<User[]> {
    // Find users whose birthday is today AND whose 9 AM local time falls within the window
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    return await this.repository
      .createQueryBuilder('user')
      .where('user.deleted_at IS NULL')
      .andWhere('EXTRACT(MONTH FROM user.birth_date) = :month', { month })
      .andWhere('EXTRACT(DAY FROM user.birth_date) = :day', { day })
      .getMany();
  }

  async findAll(): Promise<User[]> {
    return await this.repository.find({
      where: { deletedAt: undefined },
    });
  }
}
