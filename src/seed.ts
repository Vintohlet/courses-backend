import mongoose, { Model, Types } from 'mongoose'
import { hash } from 'bcryptjs'
import { Course, CourseLevel, CourseSchema } from './models/course.model.js'
import { Enrollment, EnrollmentSchema, EnrollmentStatus } from './models/enrollment.model.js'
import { Interaction, InteractionSchema, InteractionType } from './models/interaction.model.js'
import { Review, ReviewSchema } from './models/review.model.js'
import { Topic, TopicSchema } from './models/topic.model.js'
import { User, UserSchema } from './models/user.model.js'

const id = (prefix: string, number: number) => new Types.ObjectId(`${prefix}${number.toString(16).padStart(16, '0')}`)

const topics = [
  { slug: 'frontend', name: 'Frontend-разработка' },
  { slug: 'backend', name: 'Backend-разработка' },
  { slug: 'machine-learning', name: 'Машинное обучение' },
  { slug: 'data-analytics', name: 'Аналитика данных' },
  { slug: 'graphic-design', name: 'Графический дизайн' },
  { slug: 'devops', name: 'DevOps и инфраструктура' },
]

const courseSeeds = [
  { title: 'HTML и CSS: адаптивная вёрстка', category: 'frontend', tags: ['frontend'], level: CourseLevel.Beginner, shortDescription: 'Основы HTML, CSS и адаптивной вёрстки для первых веб-страниц.', fullDescription: 'Курс знакомит с семантической разметкой, каскадом стилей, Flexbox, Grid и адаптивным подходом. В конце студент соберёт небольшую страницу портфолио.', lessons: ['Структура HTML-документа', 'Селекторы и блочная модель CSS', 'Flexbox и CSS Grid', 'Адаптивность и медиазапросы'] },
  { title: 'React и TypeScript на практике', category: 'frontend', tags: ['frontend'], level: CourseLevel.Intermediate, shortDescription: 'Компоненты, состояние и типизация интерфейсов на React.', fullDescription: 'Практический вводный курс по React с TypeScript. Студент создаст интерфейс каталога, научится разбивать его на компоненты и получать данные из API.', lessons: ['Компоненты и JSX', 'Props, state и события', 'Типизация компонентов', 'Загрузка данных и формы'] },
  { title: 'Vue 3 и Composition API', category: 'frontend', tags: ['frontend'], level: CourseLevel.Intermediate, shortDescription: 'Создание интерактивных интерфейсов с Vue 3.', fullDescription: 'Разберём реактивность Vue 3, Composition API, компоненты и маршрутизацию на небольшом приложении каталога.', lessons: ['Основы Vue и шаблоны', 'Реактивность и Composition API', 'Компоненты и формы', 'Маршрутизация приложения'] },
  { title: 'Node.js API на NestJS', category: 'backend', tags: ['backend'], level: CourseLevel.Intermediate, shortDescription: 'Структурированный REST API на Node.js и NestJS.', fullDescription: 'Курс показывает модульную архитектуру NestJS: контроллеры, сервисы, DTO, валидацию и основы JWT-аутентификации.', lessons: ['Модули, контроллеры и провайдеры', 'DTO и валидация запросов', 'Подключение MongoDB', 'JWT и защита маршрутов'] },
  { title: 'Python и FastAPI: первый REST API', category: 'backend', tags: ['backend'], level: CourseLevel.Beginner, shortDescription: 'Создание и документирование REST API с FastAPI.', fullDescription: 'Студент соберёт небольшое API на FastAPI, опишет схемы данных и попробует автоматически сгенерированную документацию OpenAPI.', lessons: ['Маршруты и обработчики', 'Pydantic-схемы', 'CRUD и хранение данных', 'OpenAPI и обработка ошибок'] },
  { title: 'Проектирование данных в MongoDB', category: 'backend', tags: ['backend', 'data-analytics'], level: CourseLevel.Intermediate, shortDescription: 'Документы, embedding, ссылки и индексы в MongoDB.', fullDescription: 'Курс посвящён моделированию документов под запросы приложения. На примерах рассмотрим embedding, ссылки, уникальные индексы и простые aggregation pipeline.', lessons: ['Документная модель и BSON', 'Встраивание или ссылки', 'Индексы под запросы', 'Aggregation pipeline'] },
  { title: 'Машинное обучение с scikit-learn', category: 'machine-learning', tags: ['machine-learning', 'data-analytics'], level: CourseLevel.Beginner, shortDescription: 'Базовый ML-процесс: подготовка данных, обучение и оценка модели.', fullDescription: 'Вводный курс по supervised learning на Python. Студент подготовит признаки, обучит простую модель и оценит её качество на отложенных данных.', lessons: ['Подготовка датасета', 'Регрессия и классификация', 'Разделение выборки и метрики', 'Pipeline и подбор параметров'] },
  { title: 'Нейронные сети на PyTorch', category: 'machine-learning', tags: ['machine-learning'], level: CourseLevel.Advanced, shortDescription: 'Тензоры, обучение нейросети и цикл оптимизации в PyTorch.', fullDescription: 'Практическое знакомство с PyTorch: тензоры, слои, функция потерь, оптимизатор и базовый цикл обучения небольшой нейросети.', lessons: ['Тензоры и автодифференцирование', 'Слои и функция потерь', 'Цикл обучения модели', 'Проверка качества и переобучение'] },
  { title: 'Анализ данных на Python и pandas', category: 'data-analytics', tags: ['data-analytics', 'machine-learning'], level: CourseLevel.Beginner, shortDescription: 'Очистка, группировка и исследование табличных данных.', fullDescription: 'На небольшом наборе данных изучим DataFrame, обработку пропусков, группировки, объединение таблиц и простые графики.', lessons: ['Series и DataFrame', 'Очистка и преобразование', 'Группировки и объединение', 'Исследовательский анализ'] },
  { title: 'SQL для аналитики', category: 'data-analytics', tags: ['data-analytics'], level: CourseLevel.Beginner, shortDescription: 'Запросы, соединения и агрегаты для анализа данных.', fullDescription: 'Курс помогает освоить SELECT, фильтрацию, JOIN, GROUP BY и оконные функции на понятных аналитических задачах.', lessons: ['SELECT и фильтрация', 'JOIN нескольких таблиц', 'Агрегаты и GROUP BY', 'Оконные функции'] },
  { title: 'Дашборды в Power BI', category: 'data-analytics', tags: ['data-analytics'], level: CourseLevel.Intermediate, shortDescription: 'Модель данных и интерактивные отчёты в Power BI.', fullDescription: 'Научимся загружать данные, связывать таблицы, строить основные визуализации и собирать компактный интерактивный дашборд.', lessons: ['Импорт и преобразование данных', 'Связи таблиц и модель', 'Визуализации и фильтры', 'Публикация отчёта'] },
  { title: 'Figma: основы UI/UX-дизайна', category: 'graphic-design', tags: ['graphic-design', 'frontend'], level: CourseLevel.Beginner, shortDescription: 'Композиция интерфейса, компоненты и прототип в Figma.', fullDescription: 'Курс знакомит с сетками, типографикой, компонентами и интерактивными прототипами. Итог — макет небольшой страницы приложения.', lessons: ['Фреймы и сетки', 'Типографика и цвет', 'Компоненты и варианты', 'Интерактивный прототип'] },
  { title: 'Графический дизайн: композиция и типографика', category: 'graphic-design', tags: ['graphic-design'], level: CourseLevel.Beginner, shortDescription: 'Базовые принципы визуальной иерархии и работы с текстом.', fullDescription: 'Разберём контраст, ритм, выравнивание и типографическую иерархию на примерах постера и цифровой обложки.', lessons: ['Визуальная иерархия', 'Сетка, баланс и контраст', 'Подбор и сочетание шрифтов', 'Макет постера'] },
  { title: 'Docker и основы CI/CD', category: 'devops', tags: ['devops', 'backend'], level: CourseLevel.Intermediate, shortDescription: 'Контейнеризация приложения и базовый pipeline сборки.', fullDescription: 'Курс показывает контейнеризацию небольшого API, конфигурацию через переменные окружения и базовые этапы CI/CD pipeline.', lessons: ['Образы и контейнеры', 'Dockerfile и Compose', 'Переменные и конфигурация', 'Этапы CI/CD pipeline'] },
  { title: 'Git и командная разработка', category: 'devops', tags: ['devops', 'backend', 'frontend'], level: CourseLevel.Beginner, shortDescription: 'Ветки, pull request и аккуратная история изменений.', fullDescription: 'Короткий практический курс о повседневной работе с Git: ветвление, разрешение конфликтов, code review и командный workflow.', lessons: ['Коммиты и история', 'Ветки и слияние', 'Конфликты и их решение', 'Pull request и code review'] },
]

const userSeeds = [
  { name: 'John Doe', email: 'john.doe@example.com', interests: ['frontend', 'backend'] },
  { name: 'Jane Smith', email: 'jane.smith@example.com', interests: ['data-analytics', 'machine-learning'] },
  { name: 'Alex Johnson', email: 'alex.johnson@example.com', interests: ['backend', 'devops'] },
  { name: 'Emily Carter', email: 'emily.carter@example.com', interests: ['graphic-design', 'frontend'] },
  { name: 'Michael Chen', email: 'michael.chen@example.com', interests: ['machine-learning', 'data-analytics'] },
  { name: 'Sophia Martinez', email: 'sophia.martinez@example.com', interests: ['frontend', 'graphic-design'] },
  { name: 'Уолтер Уайт', email: 'walter.white@example.com', interests: ['machine-learning', 'data-analytics'] },
  { name: 'Джесси Пинкман', email: 'jesse.pinkman@example.com', interests: ['frontend', 'backend'] },
  { name: 'Сол Гудман', email: 'saul.goodman@example.com', interests: ['backend', 'data-analytics'] },
  { name: 'Декстер Морган', email: 'dexter.morgan@example.com', interests: ['data-analytics', 'backend'] },
  { name: 'Лионель Месси', email: 'lionel.messi@example.com', interests: ['frontend', 'graphic-design'] },
  { name: 'Спайк Шпигель', email: 'spike.spiegel@example.com', interests: ['devops', 'machine-learning'] },
]

const seedEvents: Array<Record<string, unknown>> = []
let nextEventId = 1
const eventId = () => id('65400001', nextEventId++)

async function seed() {
  const uri = process.env.MONGO_URI
  if (!uri) throw new Error('MONGO_URI is missing. Put it in .env or the environment.')
  await mongoose.connect(uri)

  const TopicModel = mongoose.model<Topic>('Topic', TopicSchema)
  const UserModel = mongoose.model<User>('User', UserSchema)
  const CourseModel = mongoose.model<Course>('Course', CourseSchema)
  const EnrollmentModel = mongoose.model<Enrollment>('Enrollment', EnrollmentSchema)
  const ReviewModel = mongoose.model<Review>('Review', ReviewSchema)
  const InteractionModel = mongoose.model<Interaction>('Interaction', InteractionSchema)
  const models: Model<any>[] = [TopicModel, UserModel, CourseModel, EnrollmentModel, ReviewModel, InteractionModel]

  await Promise.all(models.map((model) => model.createIndexes()))

  for (let index = 0; index < topics.length; index++) {
    const topic = topics[index]
    await TopicModel.updateOne({ slug: topic.slug }, { $set: { ...topic, isActive: true }, $setOnInsert: { _id: id('65000001', index + 1) } }, { upsert: true })
  }

  const passwordHash = await hash('DemoPass123!', 10)
  const users: Array<{ _id: Types.ObjectId; name: string; email: string; interests: string[] }> = []
  for (let index = 0; index < userSeeds.length; index++) {
    const user = userSeeds[index]
    const saved = await UserModel.findOneAndUpdate(
      { email: user.email },
      { $set: { name: user.name, interests: user.interests, passwordHash }, $setOnInsert: { _id: id('65100001', index + 1), isAdmin: false } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).select('_id name email interests')
    users.push(saved!.toObject())
  }

  const courses: Array<{ _id: Types.ObjectId; lessons: Array<{ _id: Types.ObjectId }> }> = []
  for (let index = 0; index < courseSeeds.length; index++) {
    const source = courseSeeds[index]
    const courseId = id('65200001', index + 1)
    const lessons = source.lessons.map((title, lessonIndex) => ({
      _id: id(`653${(index + 1).toString(16).padStart(5, '0')}`, lessonIndex + 1),
      title,
      description: `Краткий практический урок: ${title.toLowerCase()}.`,
      order: lessonIndex,
    }))
    const { lessons: _lessonTitles, ...courseFields } = source
    await CourseModel.updateOne(
      { _id: courseId },
      { $set: { ...courseFields, lessons, isActive: true }, $setOnInsert: { _id: courseId } },
      { upsert: true, runValidators: true },
    )
    courses.push({ _id: courseId, lessons })
  }

  const courseIndexesByTopic = new Map<string, number[]>()
  for (let index = 0; index < courseSeeds.length; index++) {
    const topicCourses = courseIndexesByTopic.get(courseSeeds[index].category) ?? []
    topicCourses.push(index)
    courseIndexesByTopic.set(courseSeeds[index].category, topicCourses)
  }

  const reviewsWritten: Array<{ userId: Types.ObjectId; courseId: Types.ObjectId; rating: number; text: string }> = []
  const enrollmentWrites: Array<Promise<unknown>> = []
  for (let userIndex = 0; userIndex < users.length; userIndex++) {
    const user = users[userIndex]
    const matching = user.interests.flatMap((topic) => courseIndexesByTopic.get(topic) ?? [])
    const courseIndexes = [...new Set([...matching, userIndex % courseSeeds.length, (userIndex + 5) % courseSeeds.length])]

    for (const courseIndex of courseIndexes) {
      const course = courses[courseIndex]
      const lessons = course.lessons
      const forcedJesseReview = user.email === 'jesse.pinkman@example.com' && [1, 3].includes(courseIndex)
      const completed = forcedJesseReview || (userIndex + courseIndex) % 3 !== 0
      const doneCount = completed ? lessons.length : Math.max(1, (userIndex + courseIndex) % (lessons.length - 1) + 1)
      const completedLessons = lessons.slice(0, doneCount).map((lesson) => lesson._id)
      const enrollmentStatus = completed ? EnrollmentStatus.Completed : EnrollmentStatus.Active
      const enrolledAt = new Date(Date.now() - ((userIndex * 3 + courseIndex + 7) % 180) * 86400000)
      const completedAt = completed ? new Date(enrolledAt.getTime() + (doneCount + 1) * 86400000) : undefined

      enrollmentWrites.push(EnrollmentModel.updateOne(
        { userId: user._id, courseId: course._id },
        { $set: { status: enrollmentStatus, completedLessons, enrolledAt, completedAt } },
        { upsert: true },
      ))

      seedEvents.push({ _id: eventId(), userId: user._id, courseId: course._id, type: InteractionType.View, createdAt: new Date(enrolledAt.getTime() - 3600000) })
      seedEvents.push({ _id: eventId(), userId: user._id, courseId: course._id, type: InteractionType.Enroll, createdAt: enrolledAt })
      for (const lesson of lessons.slice(0, doneCount)) {
        seedEvents.push({ _id: eventId(), userId: user._id, courseId: course._id, type: InteractionType.LessonComplete, lessonId: lesson._id, createdAt: completedAt ?? new Date(enrolledAt.getTime() + 86400000) })
      }
      if (completed) seedEvents.push({ _id: eventId(), userId: user._id, courseId: course._id, type: InteractionType.CourseComplete, createdAt: completedAt })

      const shouldReview = completed && (forcedJesseReview || (userIndex * 2 + courseIndex) % 3 !== 0)
      if (shouldReview) {
        let rating = 4 + ((userIndex + courseIndex) % 2)
        let text = ['Полезный курс, материал хорошо структурирован.', 'Понравились практические примеры, буду применять дальше.', 'Хорошее введение в тему, особенно понравились уроки с практикой.'][(userIndex + courseIndex) % 3]
        if (forcedJesseReview && courseIndex === 1) {
          rating = 1
          text = 'Этот курс херня чуваак!'
        } else if (forcedJesseReview && courseIndex === 3) {
          rating = 2
          text = 'Пустая трата времени чуваки'
        }
        const review = { userId: user._id, courseId: course._id, rating, text }
        reviewsWritten.push(review)
        enrollmentWrites.push(ReviewModel.updateOne(
          { userId: user._id, courseId: course._id },
          { $set: { rating, text } },
          { upsert: true },
        ))
        seedEvents.push({ _id: eventId(), userId: user._id, courseId: course._id, type: InteractionType.Rating, rating, reviewText: text, createdAt: completedAt })
      }
    }
  }

  await Promise.all(enrollmentWrites)
  for (const event of seedEvents) {
    await InteractionModel.updateOne({ _id: event._id }, { $setOnInsert: event }, { upsert: true })
  }

  for (const course of courses) {
    const [enrollCount, rating] = await Promise.all([
      EnrollmentModel.countDocuments({ courseId: course._id }),
      ReviewModel.aggregate([{ $match: { courseId: course._id } }, { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }]),
    ])
    await CourseModel.updateOne({ _id: course._id }, { $set: { enrollCount, ratingAvg: rating[0]?.average ?? 0, ratingCount: rating[0]?.count ?? 0 } })
  }

  console.log(`Seed complete: ${topics.length} topics, ${courseSeeds.length} courses, ${users.length} users, ${reviewsWritten.length} reviews.`)
  console.log('Demo password for all seeded users: DemoPass123!')
  console.log('Example login: john.doe@example.com')
  console.log('Jesse Pinkman login: jesse.pinkman@example.com')
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })
