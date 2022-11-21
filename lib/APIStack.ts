import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib'
import { Table } from 'aws-cdk-lib/aws-dynamodb'
import { Construct } from 'constructs'
import * as path from 'path'
import {
	GraphqlApi,
	Schema,
	AuthorizationType,
	FieldLogLevel,
	MappingTemplate,
	PrimaryKey,
	Values,
	UserPoolDefaultAction,
} from '@aws-cdk/aws-appsync-alpha'
import { UserPool } from 'aws-cdk-lib/aws-cognito'
import { IRole } from 'aws-cdk-lib/aws-iam'
import { IdentityPool } from '@aws-cdk/aws-cognito-identitypool-alpha'

interface APIStackProps extends StackProps {
	userpool: UserPool
	sampleTable: Table
	unauthenticatedRole: IRole
	identityPool: IdentityPool
}

export class APIStack extends Stack {
	public readonly graphqlURL: string
	constructor(scope: Construct, id: string, props: APIStackProps) {
		super(scope, id, props)

		const api = new GraphqlApi(this, 'APISamples', {
			name: 'APISamples',
			schema: Schema.fromAsset(path.join(__dirname, 'graphql/schema.graphql')),
			authorizationConfig: {
				defaultAuthorization: {
					authorizationType: AuthorizationType.USER_POOL,
					userPoolConfig: {
						defaultAction: UserPoolDefaultAction.ALLOW,
						userPool: props.userpool,
					},
				},
				additionalAuthorizationModes: [
					{ authorizationType: AuthorizationType.IAM },
				],
			},
			logConfig: {
				fieldLogLevel: FieldLogLevel.ALL,
			},
			xrayEnabled: true,
		})

		const ProductDataSource = api.addDynamoDbDataSource(
			'ProductDataSource',
			props.sampleTable
		)

		api.grantQuery(props.unauthenticatedRole, 'getProduct', 'listProducts')

		ProductDataSource.createResolver({
			typeName: 'Query',
			fieldName: 'getProduct',
			requestMappingTemplate: MappingTemplate.dynamoDbGetItem('id', 'id'),
			responseMappingTemplate: MappingTemplate.dynamoDbResultItem(),
		})

		ProductDataSource.createResolver({
			typeName: 'Mutation',
			fieldName: 'createProduct',
			requestMappingTemplate: MappingTemplate.dynamoDbPutItem(
				PrimaryKey.partition('id').auto(),
				Values.projecting('input')
			),
			responseMappingTemplate: MappingTemplate.dynamoDbResultItem(),
		})
		ProductDataSource.createResolver({
			typeName: 'Query',
			fieldName: 'listProducts',
			requestMappingTemplate: MappingTemplate.dynamoDbScanTable(),
			responseMappingTemplate: MappingTemplate.dynamoDbResultList(),
		})

		this.graphqlURL = api.graphqlUrl
		new CfnOutput(this, 'GraphQLAPIURL', {
			value: api.graphqlUrl,
		})

		new CfnOutput(this, 'GraphQLAPIID', {
			value: api.apiId,
		})
	}
}
