import {Router, Request, Response} from 'express';

import * as config from '../inc/config.js';
import {ErrorCodes, Roles, AUTHENTICATED_ROLES, API, API_COURSE, UserInfo, CourseInfo,API_CLASS, HIGHER_ROLES} from '../inc/constants.js';
import db from '../inc/database.js';
import * as session from '../inc/session.js';

import {apiRoute, bindApiWithRoute, apiValidatorParam, ApiRequest} from '../inc/api.js';

const router = Router();
export default router;

bindApiWithRoute(API_CLASS.CLASS__CREATE, api => apiRoute(router, api,
	apiValidatorParam(api, 'class_name').trim().notEmpty(),
	apiValidatorParam(api, 'course_id').notEmpty().isInt().toInt(),
	apiValidatorParam(api, 'startDate').optional().isDate().toDate(),
	apiValidatorParam(api, 'endDate').optional().isDate().toDate(),
	
	async (req: ApiRequest, res: Response) => {
		const userInfo = await req.ctx.getUser()?.getInfo() as UserInfo;
		const queryResult = await db.query("SELECT user_id FROM course WHERE id = ?", [req.api.params.course_id])
		const creatorId = queryResult[0]['user_id']

		if (!AUTHENTICATED_ROLES.includes(userInfo.role))
			return req.api.sendError(ErrorCodes.INVALID_PARAMETERS);

		const notAdmin = userInfo.role != Roles.SYSTEM_ADMIN

		if (!(!notAdmin || (userInfo.id == creatorId)))
			return req.api.sendError(ErrorCodes.NO_PERMISSION);
		
		const newClassId = (await db.insert('class', {
			course_id: req.api.params.course_id,
			name: req.api.params.class_name,
			startDate: req.api.params.startDate || null,
			endDate: req.api.params.endDate || null 
		}))?.insertId;

		if (!newClassId)
		 	return req.api.sendError(ErrorCodes.INTERNAL_ERROR);

		req.ctx.logActivity('Tạo lop hoc mới', { class_id: newClassId });
		req.api.sendSuccess({ class_id: newClassId });
	}
))

bindApiWithRoute(API_CLASS.CLASS__DELETE, api => apiRoute( router, api,
	apiValidatorParam(api, 'class_id').notEmpty().isInt().toInt(),

	async (req: ApiRequest, res: Response) => {
		const userInfo = await req.ctx.getUser()?.getInfo() as UserInfo;
		const r= await db.query("SELECT course.user_id FROM class INNER JOIN course ON class.course_id = course.id WHERE class.id = ?",[req.api.params.class_id])
		const result = r[0]['user_id'];
		
		if (!AUTHENTICATED_ROLES.includes(userInfo.role))
			return req.api.sendError(ErrorCodes.INVALID_PARAMETERS);

		if (result!== userInfo.role || !HIGHER_ROLES.includes(userInfo.role))
			return req.api.sendError(ErrorCodes.NO_PERMISSION);
		else await db.query("DELETE FROM class WHERE id = ?", [req.api.params.class_id]);
		
		req.api.sendSuccess();
	}
))

bindApiWithRoute(API_CLASS.CLASS__UPDATE_INFO, api => apiRoute(router, api,
	apiValidatorParam(api, 'class_id').notEmpty().isInt().toInt(),
	apiValidatorParam(api, 'name').trim().notEmpty(),
	apiValidatorParam(api, 'start_date').notEmpty().isDate().toDate(),
	apiValidatorParam(api, 'end_date').notEmpty().isDate().toDate(),

	async (req: ApiRequest, res: Response) => {
		const userInfo = await req.ctx.getUser()?.getInfo() as UserInfo;
		const r= await db.query("SELECT course.user_id FROM class INNER JOIN course ON class.course_id = course.id WHERE class.id = ?",[req.api.params.class_id])
		const result = r[0]['user_id'];
		
		if (!AUTHENTICATED_ROLES.includes(userInfo.role))
			return req.api.sendError(ErrorCodes.INVALID_PARAMETERS);

		if (result!== userInfo.role || !HIGHER_ROLES.includes(userInfo.role))
		return req.api.sendError(ErrorCodes.NO_PERMISSION);
		else await db.query('UPDATE class SET name = ? startDate = ? endDate = ? where id = ?', [req.api.params.name, req.api.params.start_date,req.api.params.end_date,req.api.params.class_id]);

		req.ctx.logActivity('Sửa thông tin lớp học', { user_id: req.api.params.class_id });
		req.api.sendSuccess();
	}
))


bindApiWithRoute(API_CLASS.CLASS__GET, api => apiRoute(router, api,
	apiValidatorParam(api, 'class_id').notEmpty().isInt().toInt(),
	
	async (req: ApiRequest, res: Response) => {
		const userInfo = await req.ctx.getUser()?.getInfo() as UserInfo;
		const queryResult = await db.query("SELECT * FROM class WHERE id = ?", [req.api.params.class_id])
		const classData = queryResult[0]

		const r= await db.query("SELECT * FROM user_class WHERE user_id = ? AND class_id = ? ",[userInfo.id, req.api.params.class_id ])
		const result = r[0]['user_id'];

		if (!AUTHENTICATED_ROLES.includes(userInfo.role))
			return req.api.sendError(ErrorCodes.INVALID_PARAMETERS);

		if (result!== userInfo.id || !HIGHER_ROLES.includes(userInfo.role))
			return req.api.sendError(ErrorCodes.NO_PERMISSION);

		req.api.sendSuccess(classData)
	}
))


bindApiWithRoute(API_CLASS.CLASS__LIST, api => apiRoute(router,api,
	apiValidatorParam(api, 'class_id').notEmpty().isInt().toInt(),

	async (req: ApiRequest, res: Response) => {
		const userInfo = await req.ctx.getUser()?.getInfo() as UserInfo;

		const r= await db.query("SELECT * FROM user_class WHERE user_id = ? AND class_id = ? ",[userInfo.id, req.api.params.class_id ])
		const result = r[0]['user_id'];
		const classesArray = r;

		if (!AUTHENTICATED_ROLES.includes(userInfo.role))
			return req.api.sendError(ErrorCodes.INVALID_PARAMETERS);

		if (result!== userInfo.id || !HIGHER_ROLES.includes(userInfo.role))
			return req.api.sendError(ErrorCodes.NO_PERMISSION);

		req.api.sendSuccess({ classes: classesArray })
	}
))

bindApiWithRoute(API_CLASS.CLASS__ADD__USER, api => apiRoute(router, api,
	apiValidatorParam(api, 'class_id').notEmpty().isInt().toInt(),
	apiValidatorParam(api, 'user_id').notEmpty().isInt().toInt(),

	async (req: ApiRequest, res: Response) => {
		const userInfo = await req.ctx.getUser()?.getInfo() as UserInfo;
		const r= await db.query("SELECT course.user_id FROM class INNER JOIN course ON class.course_id = course.id WHERE class.id = ?",[req.api.params.class_id])
		const result = r[0]['user_id'];
		
		if (!AUTHENTICATED_ROLES.includes(userInfo.role))
			return req.api.sendError(ErrorCodes.INVALID_PARAMETERS);

		if (result!== userInfo.role || !HIGHER_ROLES.includes(userInfo.role))
		return req.api.sendError(ErrorCodes.NO_PERMISSION);
		else await db.query('INSERT INTO user_class(user_id,class_id) VALUES(?,?)', [req.api.params.user_id, req.api.params.class_id]);

		req.ctx.logActivity('Them vao lớp học', { user_class_id: req.api.params.class_id });
		req.api.sendSuccess();
	}
))

bindApiWithRoute(API_CLASS.CLASS__DELETE__USER, api => apiRoute(router, api,
	apiValidatorParam(api, 'user_id').notEmpty().isInt().toInt(),
	apiValidatorParam(api, 'class_id').notEmpty().isInt().toInt(),

	async (req: ApiRequest, res: Response) => {
		const userInfo = await req.ctx.getUser()?.getInfo() as UserInfo;
		const r= await db.query("SELECT course.user_id FROM class INNER JOIN course ON class.course_id = course.id WHERE class.id = ?",[req.api.params.class_id])
		const result = r[0]['user_id'];
		
		if (!AUTHENTICATED_ROLES.includes(userInfo.role))
			return req.api.sendError(ErrorCodes.INVALID_PARAMETERS);

		if (result!== userInfo.role || !HIGHER_ROLES.includes(userInfo.role))
		return req.api.sendError(ErrorCodes.NO_PERMISSION);
		else await db.query('DETELE FROM user_class(user_id,class_id) VALUES(?,?)', [req.api.params.user_id, req.api.params.class_id]);

		req.ctx.logActivity('xoa trong lớp học', { user_class_id: req.api.params.class_id });
		req.api.sendSuccess();
	}
))

